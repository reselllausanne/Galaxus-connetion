import { promises as fs } from "fs";
import path from "path";
import Client from "ssh2-sftp-client";
import { config, logger } from "@resell-lausanne/shared";

export async function uploadGalaxusFiles() {
  const sftp = new Client();
  const targets = [
    "galaxus_price_stock.csv",
    "galaxus_master.csv",
    "galaxus_validation_report.csv"
  ];

  const connectionOptions: Record<string, unknown> = {
    host: config.GALAXUS_SFTP_HOST,
    port: config.GALAXUS_SFTP_PORT,
    username: config.GALAXUS_SFTP_USER
  };

  if (config.GALAXUS_SFTP_KEY_PATH) {
    connectionOptions.privateKey = await fs.readFile(config.GALAXUS_SFTP_KEY_PATH, "utf-8");
  } else if (config.GALAXUS_SFTP_PASS) {
    connectionOptions.password = config.GALAXUS_SFTP_PASS;
  }

  try {
    await sftp.connect(connectionOptions);

    for (const fileName of targets) {
      const localPath = path.join(config.EXPORTS_PATH, fileName);
      const remoteDir = config.GALAXUS_SFTP_REMOTE_DIR;
      const remoteTemp = path.posix.join(remoteDir, `${fileName}.tmp`);
      const remoteFinal = path.posix.join(remoteDir, fileName);

      logger.info({ fileName }, "Uploading Galaxus file");
      await sftp.put(localPath, remoteTemp);
      await sftp.rename(remoteTemp, remoteFinal);
    }

    return { uploaded: targets.length };
  } catch (error) {
    logger.error({ error }, "Galaxus upload failed");
    throw error;
  } finally {
    sftp.end();
  }
}

