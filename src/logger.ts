import winston from "winston";

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.cli(),
      level: "info"
    }),
    new winston.transports.File({
      filename: "wallet-cleanup.log",
      level: "silly",
      format: winston.format.combine(
        winston.format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss"
        }),
        winston.format.padLevels(),
        winston.format.printf(({timestamp, level, message}) => `${timestamp} ${level}:${message}`)
      ),
      tailable: true,
      maxsize: 100 * 1024 * 1024,
      maxFiles: 5,
      zippedArchive: true,
    })
  ]
});