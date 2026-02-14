import { ObjectId, ReadPreference } from "mongodb";
import { getDb } from "../config/database";
import { env } from "../config/env";

export interface CustomerItem {
  id: string;
  name: string;
  email: string;
}

interface RawUserDoc {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
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
