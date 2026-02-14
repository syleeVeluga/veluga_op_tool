import { ObjectId, ReadPreference } from "mongodb";
import { getDb } from "../config/database";
import { env } from "../config/env";

export interface CustomerItem {
  id: string;
  name: string;
  email: string;
}

export interface PartnerCustomerResolveResult {
  partnerId: string;
  customerIds: string[];
  customers: CustomerItem[];
}

interface RawUserDoc {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  members?: unknown;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchCustomers(query: string): Promise<CustomerItem[]> {
  const keyword = query.trim();
  const regex = new RegExp(escapeRegex(keyword), "i");
  const idCondition = ObjectId.isValid(keyword) ? { _id: new ObjectId(keyword) } : null;

  const db = await getDb("prod");

  const docs = (await db
    .collection("users")
    .find(
      {
        $or: [
          ...(idCondition ? [idCondition] : []),
          { name: regex },
          { email: regex },
        ],
      },
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
        },
        sort: { createdAt: -1, _id: -1 },
        limit: 20,
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      }
    )
    .toArray()) as RawUserDoc[];

  return docs
    .map((doc) => {
      const id = doc._id !== undefined && doc._id !== null ? String(doc._id) : "";
      const email = typeof doc.email === "string" ? doc.email : "";
      const name = typeof doc.name === "string" && doc.name.trim() ? doc.name : email;

      return {
        id,
        name,
        email,
      };
    })
    .filter((customer) => customer.id && (customer.name || customer.email));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (item !== undefined && item !== null ? String(item).trim() : ""))
    .filter((item) => item.length > 0);
}

export async function resolveCustomersByPartnerId(
  partnerId: string
): Promise<PartnerCustomerResolveResult> {
  const trimmedPartnerId = partnerId.trim();

  if (!trimmedPartnerId) {
    throw new Error("partnerId is required");
  }

  const db = await getDb("prod");
  const usersCollection = db.collection("users");

  const ownerDoc = (await usersCollection.findOne(
    {
      $expr: {
        $eq: [{ $toString: "$_id" }, trimmedPartnerId],
      },
    },
    {
      projection: {
        _id: 1,
        members: 1,
      },
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    }
  )) as RawUserDoc | null;

  const memberIds = toStringArray(ownerDoc?.members);
  const candidateIds = Array.from(new Set([trimmedPartnerId, ...memberIds]));

  if (candidateIds.length === 0) {
    return {
      partnerId: trimmedPartnerId,
      customerIds: [],
      customers: [],
    };
  }

  const customerDocs = (await usersCollection
    .find(
      {
        $expr: {
          $in: [{ $toString: "$_id" }, candidateIds],
        },
      },
      {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
        },
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      }
    )
    .toArray()) as RawUserDoc[];

  const customers = customerDocs
    .map((doc) => {
      const id = doc._id !== undefined && doc._id !== null ? String(doc._id) : "";
      const email = typeof doc.email === "string" ? doc.email : "";
      const name = typeof doc.name === "string" && doc.name.trim() ? doc.name : email;

      return {
        id,
        name,
        email,
      };
    })
    .filter((customer) => customer.id);

  const customerIds = customers.map((customer) => customer.id);

  return {
    partnerId: trimmedPartnerId,
    customerIds,
    customers,
  };
}
