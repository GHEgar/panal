import { installAggregationWorker } from '@ghegar/panal/worker/runtime';

installAggregationWorker(self as unknown as Parameters<typeof installAggregationWorker>[0]);
