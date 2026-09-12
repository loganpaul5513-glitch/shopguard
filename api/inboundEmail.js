import { handleInboundEmailRequest } from "../server/inboundEmailHandler.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  await handleInboundEmailRequest(req, res, process.env);
}
