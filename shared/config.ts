import { developmentConfig } from './environments/development';
import { productionConfig } from './environments/production';

const APP_ENV = process.env.APP_ENV ?? 'development';

const configs = {
  development: developmentConfig,
  production: productionConfig,
};

export const config = configs[APP_ENV];  // ← exports the right one