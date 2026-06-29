import * as dotenv from 'dotenv';
dotenv.config();
import { Application } from './Application';

console.log(`${process.env.npm_package_name} v${process.env.npm_package_version}`,process.env.NODE_ENV,);

export const application = new Application()
  .buildHost(`${process.env.APP_HOST}`)
  .buildPort(parseInt(process.env.APP_PORT))
  .buildUri(`${process.env.MONGO_URL}`)
  .buildSwagger()

application.startServer();
application.connectMongo();
