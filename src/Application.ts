import * as Helmet from 'koa-helmet';
import * as Logger from 'koa-logger';
import * as BodyParser from 'koa-bodyparser';
import * as Koa from 'koa';

import { createServer, Server } from 'http';
import { Module } from '@ubaytools/core';
import Routes from './routes';
import { CorsMiddleware, ModernMiddleware, CorrelationMiddleware } from './middleware';
import {SwaggerRouter} from "koa-swagger-decorator";

import {koaSwagger} from "koa2-swagger-ui";
import * as fs from "fs";
import * as path from 'path'
import { CronTasks } from './services/cron/CronTasks';
import { FirebaseNotification } from './services/firebase-notification/FirebaseNotification';

export class Application {
  protected _mongoUrl: string;
  protected _host: string;
  protected _port: number;

  server = new Server();
  koa = new Koa();
  mongo = Module.Mongo();

  buildHost(host: string): Application {
    this._host = host;
    return this;
  }

  buildPort(port: number): Application {
    this._port = port;
    return this;
  }

  buildUri(mongoUrl: string): Application {
    this._mongoUrl = mongoUrl;
    return this;
  }

  buildSwagger(): Application {
    // Create a SwaggerRouter instance
    const swaggerRouter = new SwaggerRouter();

    // Configure SwaggerRouter
    swaggerRouter.swagger({
      title: 'Ubaytools integration API',
      description: 'Integration API for ubaytools',
      version: '1.0.0',
      swaggerOptions: {
        securityDefinitions: {
          bearerAuth: {
            name: 'Authorization',
            in: 'header',
            type: 'apiKey',
            description: 'JWT Authorization header',
          },
        },
      },
    });

    const swaggerDir = process.cwd() + '/public';
    if (!fs.existsSync(swaggerDir)) {
      fs.mkdirSync(swaggerDir);
    }

    // Map controllers to SwaggerRouter
    swaggerRouter.mapDir(__dirname);
    swaggerRouter.dumpSwaggerJson({ filename: 'swagger.json', dir: swaggerDir });

    return this;
  }

  startServer(): Application {
    this.koa.proxy = true;
    this.koa.use(Logger());
    this.koa.use(CorrelationMiddleware);
    this.koa.use(
      Helmet({
        contentSecurityPolicy: process.env.NODE_ENV !== 'development',
      }),
    );
    this.koa.use(CorsMiddleware);
    this.koa.use(ModernMiddleware);
    this.koa.use(BodyParser());

    // Serve Swagger UI at /docs
    this.koa.use(
      koaSwagger({
        routePrefix: '/docs', // Host Swagger UI at /docs
        swaggerOptions: {
          spec: require(path.join(process.cwd(), 'public/swagger.json')),
        },
      }),
    );

    this.koa.use(Routes.routes());
    this.koa.use(Routes.allowedMethods());

    this.server = createServer(this.koa.callback());
    this.server.listen(this._port, this._host);
    console.log(`Server listening: ${this._host}:${this._port}`);

    // Initialize and start cron tasks
    this.initializeCronTasks();

    this.initializeFirebaseAdmin();
    
    return this;
  }

  connectMongo(): Application {
    this.mongo.buildUri(this._mongoUrl).buildOptions({ autoIndex: false }).connect().then();
    return this;
  }

  private initializeCronTasks(): void {
    try {
      console.log('[CRON] Initializing cron tasks...');
      CronTasks.initialize();
      CronTasks.start();
      console.log('[CRON] Cron tasks started successfully');
    } catch (error) {
      console.error('[CRON] Failed to initialize cron tasks:', error);
    }
  }

  private initializeFirebaseAdmin(): void {
    // Call the static method from FirebaseNotification
    FirebaseNotification.initializeFirebaseAdmin();
  }


  // connectRabbitMQ() {
  //   const amqp = Module.Amqp();
  //   amqp.connect().then();
  // }
}
