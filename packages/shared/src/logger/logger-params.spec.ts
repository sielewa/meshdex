import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACTED_PATHS } from './logger.constants';
import { buildLoggerParams } from './logger-params';

function pinoOptions(pretty: boolean): pino.LoggerOptions {
  const params = buildLoggerParams({
    serviceName: 'asset-service',
    level: 'info',
    pretty,
  });

  return params.pinoHttp as pino.LoggerOptions;
}

function captureLine(options: pino.LoggerOptions, log: (logger: pino.Logger) => void): unknown {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done): void {
      lines.push(chunk.toString());
      done();
    },
  });

  log(pino(options, sink));

  return JSON.parse(lines[0] ?? '{}');
}

describe('buildLoggerParams', () => {
  it('writes JSON lines with the service name and a text level', () => {
    const line = captureLine(pinoOptions(false), (logger) => {
      logger.info({ assetId: 'a1' }, 'asset uploaded');
    });

    expect(line).toMatchObject({
      service: 'asset-service',
      level: 'info',
      assetId: 'a1',
      msg: 'asset uploaded',
    });
  });

  it('masks secrets on the redacted paths', () => {
    const line = captureLine(pinoOptions(false), (logger) => {
      logger.info(
        {
          credentials: {
            password: 'hunter2',
            secretAccessKey: 'abc',
          },
        },
        'connect',
      );
    });

    expect(JSON.stringify(line)).not.toContain('hunter2');
    expect(JSON.stringify(line)).not.toContain('abc');
  });

  it('uses the pretty transport only when asked', () => {
    expect(pinoOptions(true).transport).toBeDefined();
    expect(pinoOptions(false).transport).toBeUndefined();
  });

  it('redacts authorization headers of HTTP requests', () => {
    expect(REDACTED_PATHS).toContain('req.headers.authorization');
  });
});
