import { HrTime, ValueType } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import { emptyResource } from '@opentelemetry/resources';
import {
  AggregationTemporality,
  CollectionResult,
  DataPointType,
  MetricProducer,
  ScopeMetrics,
} from '@opentelemetry/sdk-metrics';

import { PrismaFactory } from '../prisma/factory';

function transformPrismaKey(key: string) {
  // replace first '_' to '/' as a scope prefix
  // example: prisma_client_query_duration_seconds_sum -> prisma/client_query_duration_seconds_sum
  return key.replace(/_/, '/');
}

export class PrismaMetricProducer implements MetricProducer {
  private readonly startTime: HrTime = hrTime();

  async collect(): Promise<CollectionResult> {
    const result: CollectionResult = {
      resourceMetrics: {
        resource: emptyResource(),
        scopeMetrics: [],
      },
      errors: [],
    };

    if (!PrismaFactory.INSTANCE) {
      return result;
    }

    const prisma = PrismaFactory.INSTANCE;

    const endTime = hrTime();

    const metrics = await prisma.$metrics.json();
    const scopeMetrics: ScopeMetrics = {
      scope: {
        name: '',
      },
      metrics: [],
    };
    for (const counter of metrics.counters) {
      scopeMetrics.metrics.push({
        descriptor: {
          name: transformPrismaKey(counter.key),
          description: counter.description,
          unit: '1',
          valueType: ValueType.INT,
        },
        dataPointType: DataPointType.SUM,
        aggregationTemporality: AggregationTemporality.CUMULATIVE,
        dataPoints: [
          {
            startTime: this.startTime,
            endTime: endTime,
            value: counter.value,
            attributes: counter.labels,
          },
        ],
        isMonotonic: true,
      });
    }

    for (const gauge of metrics.gauges) {
      scopeMetrics.metrics.push({
        descriptor: {
          name: transformPrismaKey(gauge.key),
          description: gauge.description,
          unit: '1',
          valueType: ValueType.INT,
        },
        dataPointType: DataPointType.GAUGE,
        aggregationTemporality: AggregationTemporality.CUMULATIVE,
        dataPoints: [
          {
            startTime: this.startTime,
            endTime: endTime,
            value: gauge.value,
            attributes: gauge.labels,
          },
        ],
      });
    }

    for (const histogram of metrics.histograms) {
      const boundaries = [];
      const counts = [];
      for (const [boundary, count] of histogram.value.buckets) {
        boundaries.push(boundary);
        counts.push(count);
      }
      scopeMetrics.metrics.push({
        descriptor: {
          name: transformPrismaKey(histogram.key),
          description: histogram.description,
          unit: 'ms',
          valueType: ValueType.DOUBLE,
        },
        dataPointType: DataPointType.HISTOGRAM,
        aggregationTemporality: AggregationTemporality.CUMULATIVE,
        dataPoints: [
          {
            startTime: this.startTime,
            endTime: endTime,
            value: {
              buckets: {
                boundaries,
                counts,
              },
              count: histogram.value.count,
              sum: histogram.value.sum,
            },
            attributes: histogram.labels,
          },
        ],
      });
    }

    result.resourceMetrics.scopeMetrics.push(scopeMetrics);

    return result;
  }
}
