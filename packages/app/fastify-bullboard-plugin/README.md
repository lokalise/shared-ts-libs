# bull-board

Bull board is an internal Autopilot dashboard which provided a UI built on top of Bull or BullMQ to help you visualize
your queues and their jobs.
It gives you the possibility of visualizing what's happening with each job in your queues, their status and some actions
that will enable you to get the job done.

Internally, we are using an open source library, [bull-board](https://github.com/felixmosh/bull-board), which provides
all the functionalities we mentioned above.

## Ownership

This service is owned and maintained by the members of the Translation team of Autopilot.
Namely, it was initiated by @CarlosGamero.

## Getting Started

1. Install all project dependencies:

   ```shell
   npm install
   ```

2. Launch all the infrastructural dependencies locally:

   ```shell
   docker compose up -d
   ```

3. To run application:

   ```shell
   npm run start:dev
   ```
