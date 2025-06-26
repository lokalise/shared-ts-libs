import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { Resource } from '@opentelemetry/resources'
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { PrismaInstrumentation } from '@prisma/instrumentation'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { LokaliseBatchSpanProcessor, LokaliseSimpleSpanProcessor } from './spanProcessors.ts'

export interface PrismaOtelTracingPluginConfig {
  isEnabled: boolean
  useBatchSpans: boolean
  samplingRatio: number
  serviceName: string
}

function plugin(_app: FastifyInstance, opts: PrismaOtelTracingPluginConfig, done: () => void) {
  if (opts.isEnabled) {
    const provider = new NodeTracerProvider({
      sampler: new TraceIdRatioBasedSampler(opts.samplingRatio),
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: opts.serviceName,
      }),
    })

    // Is configured by OTEL_EXPORTER_OTLP_* env vars
    const otlpExporter = new OTLPTraceExporter()

    // Production sends spans in batches
    if (opts.useBatchSpans) {
      provider.addSpanProcessor(new LokaliseBatchSpanProcessor(otlpExporter))
    } else {
      provider.addSpanProcessor(new LokaliseSimpleSpanProcessor(otlpExporter))
    }

    registerInstrumentations({
      instrumentations: [new PrismaInstrumentation()],
      tracerProvider: provider,
    })

    provider.register()
  }

  done()
}

export const prismaOtelTracingPlugin = fp(plugin, {
  fastify: '>=4.0.0',
  name: 'prisma-otel-tracing-plugin',
})
