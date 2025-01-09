export const isPromiseFinished = <T>(promise: Promise<T>): Promise<boolean> =>
  Promise.race<boolean>([
    new Promise<boolean>((done) => setTimeout(() => done(false), 1000)),
    promise.then(() => true).catch(() => true),
  ])
