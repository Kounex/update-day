export const TYPES = {
  Bot: Symbol('Bot'),
  Command: Symbol('Command'),
  Client: Symbol('Client'),
  Config: Symbol('Config'),
  Managers: {
    Scrape: Symbol('ObserveManager'),
    Scheduler: Symbol('SchedulerManager'),
  },
  Services: {
    Scrape: Symbol('Scrape'),
  },
};
