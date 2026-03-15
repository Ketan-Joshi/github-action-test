import { developmentConfig } from './environments/development';
import { productionConfig } from './environments/production';
import { EnvironmentConfig } from './config.types';

const APP_ENV = process.env.APP_ENV ?? 'development';

const configs: Record<string, EnvironmentConfig> = {
  development: developmentConfig,
  production: productionConfig,
};

if (!configs[APP_ENV]) {
  throw new Error(
    `Unknown APP_ENV: "${APP_ENV}". Valid values are: ${Object.keys(configs).join(', ')}`
  );
}

console.log(`✅ Loading config for environment: ${APP_ENV}`);

export const config: EnvironmentConfig = configs[APP_ENV] as EnvironmentConfig;

// Re-export types so other files can import from one place
export type { EcsAppConfig, EnvironmentConfig } from './config.types';