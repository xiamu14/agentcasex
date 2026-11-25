import { handleApiRequest } from "../server/api-handler.mjs";

export default function handler(req, res) {
  return handleApiRequest(req, res, () => {
    res.statusCode = 404;
    res.end("Not found");
  });
}
