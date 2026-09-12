import { handleAdminRequest } from "../server/adminHandler.js";

export default async function handler(req, res) {
  await handleAdminRequest(req, res, process.env);
}
