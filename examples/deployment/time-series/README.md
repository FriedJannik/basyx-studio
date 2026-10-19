# Time series example

Studio without login, a BaSyx Go AAS environment and InfluxDB 2.7, with a
simulated climate sensor that writes a temperature and a humidity point every
two seconds ([ADR 0040](../../../docs/adr/0040-connections-on-infrastructures.md)).

```bash
docker compose up -d
```

Open <http://localhost:3000>, then *Local BaSyx* → *Climate sensor*. The
*Time Series Data* widget on the Overview, and the submodel's *Visualization*
in the details pane, show three segments:

| Segment | Data | Read by Studio from |
| --- | --- | --- |
| `LinkedSegment` | live sensor data, with an hour of history | InfluxDB, through the `influx` connection |
| `InternalSegment` | 12 records of a calibration run | the submodel |
| `ExternalSegment` | 60 rows of a commissioning log | the File's attachment (`commissioning.csv`) |

Pick *Temperature* and *Humidity*, a time range and *Auto refresh*, then
*Fetch data*. In the *Infrastructures* panel, the infrastructure shows the
connection; *Test connection* checks it.

What the example shows:

- The LinkedSegment names `http://localhost:8086`, as the BaSyx AAS Web UI
  examples do. That address is an alias of the connection: Studio sends the
  query to `http://influxdb:8086` on the Compose network instead.
- `influx-read-token` creates a token with read access to the `basyx` bucket
  only. Studio reads it as `file:/run/influx/read-token`; it never reaches the
  browser, the app or Studio's API.
- The units (°C, %) come from the concept descriptions of the records.

`smoke-test.mjs` starts the same stack with a Studio image of your choice and
checks it through Studio's API, as CI does with the image it builds:

```bash
STUDIO_IMAGE=basyx-studio:dev node smoke-test.mjs
```
