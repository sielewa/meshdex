import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUrl, Max, Min } from 'class-validator';
import { ConfigValidationException } from './config-validation.exception';
import { validateConfig } from './validate-config';

class ExampleEnv {
  @IsUrl({
    require_tld: false,
    protocols: ['postgres'],
  })
  DATABASE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  POOL_MAX!: number;

  @IsString()
  API_SECRET!: string;
}

describe('validateConfig', () => {
  it('returns a typed instance with env strings converted', () => {
    const config = validateConfig(ExampleEnv, {
      DATABASE_URL: 'postgres://asset@localhost:5432/asset',
      POOL_MAX: '10',
      API_SECRET: 'local',
    });

    expect(config).toBeInstanceOf(ExampleEnv);
    expect(config.POOL_MAX).toBe(10);
  });

  it('lists every problem at once', () => {
    const run = (): ExampleEnv => validateConfig(ExampleEnv, { POOL_MAX: '500' });

    expect(run).toThrow(ConfigValidationException);

    try {
      run();
    } catch (error) {
      const { problems } = error as ConfigValidationException;
      expect(problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DATABASE_URL'),
          expect.stringContaining('POOL_MAX'),
          expect.stringContaining('API_SECRET'),
        ]),
      );
    }
  });

  it('never puts variable values into the error message', () => {
    try {
      validateConfig(ExampleEnv, {
        DATABASE_URL: 'not-a-url-with-password-hunter2',
        POOL_MAX: '10',
        API_SECRET: 'local',
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});
