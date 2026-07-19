import fs from "fs";
import path from "path";

// Serialize `data` as pretty-printed JSON and write it to `filePath`.
export function writeJsonFile(data, filename) {
  fs.writeFileSync(
    path.join(import.meta.dirname, filename),
    JSON.stringify(data, null, 2),
  );
}
