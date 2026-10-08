import { type AuthDb, createAuth } from "@finopenpos/auth";
import { serverUrls } from "@finopenpos/env/server";
import { db } from "./db";

export const auth = createAuth({
	db: db as AuthDb,
	baseURL: serverUrls.betterAuthUrl,
});
