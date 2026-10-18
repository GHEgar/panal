import { installAggregationWorker } from '@npmegar/panal/worker/runtime';

installAggregationWorker(self as unknown as Parameters<typeof installAggregationWorker>[0]);
