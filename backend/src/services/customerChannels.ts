import { ObjectId, ReadPreference, type Document } from "mongodb";
import { getDb } from "../config/database";
import { env } from "../config/env";
import { schemaRegistry } from "../config/schema";
import type { DataType } from "../config/schema/types";

export interface CustomerChannelItem {
  channelId: string;
  channelName?: string;
}

function normalizeValue(value: unknown): string {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function resolveChannelKey(dataType: DataType): string | null {
  const schema = schemaRegistry[dataType];

  const exactFilter = schema.filters.find((filter) => filter.key === "channel");
  if (exactFilter) {
    return exactFilter.key;
  }

  const channelLikeFilter = schema.filters.find((filter) => /channel/i.test(filter.key));
  if (channelLikeFilter) {
    return channelLikeFilter.key;
  }

  const exactColumn = schema.columns.find((column) => column.key === "channel");
  if (exactColumn) {
    return exactColumn.key;
  }

  const channelLikeColumn = schema.columns.find((column) => /channel/i.test(column.key));
  return channelLikeColumn?.key ?? null;
}

function buildCustomerCandidates(customerId: string): Array<string | ObjectId> {
  const out: Array<string | ObjectId> = [customerId];

  if (ObjectId.isValid(customerId)) {
    out.push(new ObjectId(customerId));
  }

  return out;
}

export async function listCustomerChannels(
  dataType: DataType,
  customerId: string
): Promise<CustomerChannelItem[]> {
  const normalizedCustomerId = customerId.trim();
  if (!normalizedCustomerId) {
    throw new Error("customerId is required");
  }

  const schema = schemaRegistry[dataType];
  const channelKey = resolveChannelKey(dataType);

  if (!channelKey) {
    return [];
  }

  const db = await getDb(schema.dbName);

  const channelValues = (await db
    .collection(schema.collection)
    .distinct(channelKey, {
      [schema.customerField]: { $in: buildCustomerCandidates(normalizedCustomerId) },
    }, {
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    })) as unknown[];

  const channelIds = Array.from(
    new Set(
      channelValues
        .map((value) => normalizeValue(value))
        .filter((value) => value.length > 0)
    )
  );

  if (channelIds.length === 0) {
    return [];
  }

  const objectIds = channelIds.filter((value) => ObjectId.isValid(value)).map((value) => new ObjectId(value));

  const channelDocs = (await (await getDb("prod"))
    .collection<Document>("channels")
    .find(
      {
        $or: [
          { _id: { $in: objectIds } },
          { channel: { $in: channelIds } },
        ],
      },
      {
        projection: {
          _id: 1,
          channel: 1,
          name: 1,
          displayName: 1,
          title: 1,
        },
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      }
    )
    .toArray()) as Array<{
    _id?: unknown;
    channel?: unknown;
    name?: unknown;
    displayName?: unknown;
    title?: unknown;
  }>;

  const nameById = new Map<string, string>();

  for (const doc of channelDocs) {
    const idCandidates = [normalizeValue(doc._id), normalizeValue(doc.channel)];
    const channelName =
      (typeof doc.displayName === "string" && doc.displayName.trim()) ||
      (typeof doc.name === "string" && doc.name.trim()) ||
      (typeof doc.title === "string" && doc.title.trim()) ||
      "";

    if (!channelName) {
      continue;
    }

    for (const id of idCandidates) {
      if (id) {
        nameById.set(id, channelName);
      }
    }
  }

  return channelIds.map((channelId) => ({
    channelId,
    channelName: nameById.get(channelId),
  }));
}
