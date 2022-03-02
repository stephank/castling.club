import createApp, { BaseApp, AppConfig } from "../shared/createApp";

import deliverCtrl, { DeliverCtrl } from "./deliver";

export interface DeliverApp extends BaseApp {
  deliver: DeliverCtrl;
}

export default async (config: AppConfig): Promise<DeliverApp> => {
  const app = <DeliverApp>await createApp(config);

  // Parts of the app. These interconnect, so order is important.
  // (Basically poor-man's dependency injection.)
  app.deliver = await deliverCtrl(app);

  return app;
};
