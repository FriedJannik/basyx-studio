import type { JsonObject } from '~~/server/lib/aas/outline'
import { segmentSemanticIds, timeSeriesSemanticId } from '#shared/contract'

// Fixtures ported from the BaSyx AAS Web UI's Time Series tests
// (tests/components/Plugins/Submodels/fixtures), in the shape the AAS API
// returns: InfluxDB's annotated CSV with Telegraf's MQTT `topic` tag, and a
// submodel with an internal, a linked and an external segment.

export const influxHeader = ',result,table,_start,_stop,_time,_value,_field,_measurement,host,topic'

export const influxAirQualityMultiTable = [
  influxHeader,
  ',_result,0,2026-05-13T19:09:21.938241085Z,2026-05-13T19:19:21.938241085Z,2026-05-13T19:15:53.340582794Z,398.98591876151926,value,float_metric,basyx_host,EnvironmentalSensor/AirQuality',
  ',_result,0,2026-05-13T19:09:21.938241085Z,2026-05-13T19:19:21.938241085Z,2026-05-13T19:15:54.345702712Z,264.02277354502803,value,float_metric,basyx_host,EnvironmentalSensor/AirQuality',
  ',_result,1,2026-05-13T19:09:21.938241085Z,2026-05-13T19:19:21.938241085Z,2026-05-13T19:15:55.351951587Z,695.6357687379142,value,float_metric,basyx_host,EnvironmentalSensor/AirQuality',
  ',_result,1,2026-05-13T19:09:21.938241085Z,2026-05-13T19:19:21.938241085Z,2026-05-13T19:15:56.355408004Z,351.39835184433974,value,float_metric,basyx_host,EnvironmentalSensor/AirQuality',
].join('\n')

const keys = (value: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value }] })

function property (idShort: string, value?: string, semanticId?: string): JsonObject {
  return { modelType: 'Property', idShort, valueType: 'xs:string', ...(value === undefined ? {} : { value }), ...(semanticId ? { semanticId: keys(semanticId) } : {}) }
}

function collection (idShort: string, value: JsonObject[], semanticId?: string): JsonObject {
  return { modelType: 'SubmodelElementCollection', idShort, value, ...(semanticId ? { semanticId: keys(semanticId) } : {}) }
}

export const linkedQuery = 'from(bucket: "basyx") |> range(start: v.timeRangeStart, stop: v.timeRangeStop) |> filter(fn: (r) => r["_field"] == "{{y-value}}") |> aggregateWindow(every: v.windowPeriod, fn: mean)'

export function timeSeriesSubmodel (options: { endpoint?: string, query?: string, data?: JsonObject } = {}): JsonObject {
  return {
    modelType: 'Submodel',
    id: 'https://example.org/sm/time-series',
    idShort: 'TimeSeries',
    semanticId: { type: 'ModelReference', keys: [{ type: 'Submodel', value: timeSeriesSemanticId }] },
    submodelElements: [
      collection('Metadata', [
        collection('Record', [
          property('Time', undefined, 'https://admin-shell.io/idta/TimeSeries/UtcTime/1/1'),
          property('AirQuality', undefined, 'https://example.org/cd/air-quality'),
          property('rpm'),
        ]),
      ]),
      collection('Segments', [
        collection('InternalSegment', [
          collection('Records', [
            collection('Record01', [property('time', '2026-05-13T19:15:53.340582794Z'), property('AirQuality', '398.98'), property('rpm', '1200')]),
            collection('Record02', [property('time', '2026-05-13T19:15:54.345702712Z'), property('AirQuality', '264.02'), property('rpm', 'n/a')]),
            collection('Record03', [property('time', '2026-05-13T19:20:00Z'), property('AirQuality', '300'), property('rpm', '1300')]),
          ]),
        ], segmentSemanticIds.internal),
        collection('LinkedSegment', [
          property('Endpoint', options.endpoint ?? 'http://localhost:8086/api/v2/query?org=basyx'),
          property('Query', options.query ?? linkedQuery),
        ], segmentSemanticIds.linked),
        collection('ExternalSegment', [
          options.data ?? { modelType: 'File', idShort: 'Data', contentType: 'text/csv', value: '/aasx/files/air.csv' },
        ], segmentSemanticIds.external),
        collection('Other', [], 'https://example.org/not-a-segment'),
      ]),
    ],
  }
}

export const airQualityConceptDescription: JsonObject = {
  modelType: 'ConceptDescription',
  id: 'https://example.org/cd/air-quality',
  embeddedDataSpecifications: [{ dataSpecificationContent: { modelType: 'DataSpecificationIec61360', preferredName: [{ language: 'en', text: 'Air quality' }], unit: 'ppm' } }],
}
