// The demo world of Fleet Atlas: fictitious manufacturers, product families,
// machines and three sites. Every company, product and address is invented;
// domains use the reserved .example top-level domain.

/** Manufacturers with their brand color (logos, product images) and address. */
export const manufacturers = {
  voltrix: { name: 'Voltrix Drives GmbH', short: 'Voltrix', color: '#0057B8', street: 'Industriestraße 14', zip: '70565', city: 'Stuttgart', country: 'DE', phone: '+49 711 4410 0' },
  nordwerk: { name: 'Nordwerk Elektromotoren AG', short: 'Nordwerk', color: '#00897B', street: 'Am Werfthafen 3', zip: '28197', city: 'Bremen', country: 'DE', phone: '+49 421 5520 0' },
  kessler: { name: 'Kessler Antriebstechnik GmbH', short: 'Kessler', color: '#C62828', street: 'Mainaustraße 41', zip: '97082', city: 'Würzburg', country: 'DE', phone: '+49 931 3080 0' },
  hydra: { name: 'Hydra Pumpen GmbH', short: 'Hydra', color: '#1565C0', street: 'Phoenixseestraße 9', zip: '44263', city: 'Dortmund', country: 'DE', phone: '+49 231 9170 0' },
  aquilon: { name: 'Aquilon Fluid Systems B.V.', short: 'Aquilon', color: '#00838F', street: 'Strijp-S Torenallee 20', zip: '5617 BC', city: 'Eindhoven', country: 'NL', phone: '+31 40 211 7700' },
  brennecke: { name: 'Brennecke Ventiltechnik GmbH', short: 'Brennecke', color: '#6A1B9A', street: 'Fuldaer Weg 7', zip: '34123', city: 'Kassel', country: 'DE', phone: '+49 561 8040 0' },
  brightline: { name: 'Brightline Sensorik GmbH', short: 'Brightline', color: '#F9A825', street: 'Solarstraße 2', zip: '79110', city: 'Freiburg im Breisgau', country: 'DE', phone: '+49 761 2290 0' },
  lumetra: { name: 'Lumetra Instruments AG', short: 'Lumetra', color: '#283593', street: 'Baarerstrasse 61', zip: '6300', city: 'Zug', country: 'CH', phone: '+41 41 760 3300' },
  orbis: { name: 'Orbis Control Systems GmbH', short: 'Orbis', color: '#37474F', street: 'Hafenstraße 47', zip: '4020', city: 'Linz', country: 'AT', phone: '+43 732 6110 0' },
  tecnova: { name: 'Tecnova Automazione S.r.l.', short: 'Tecnova', color: '#2E7D32', street: 'Via del Lavoro 18', zip: '40127', city: 'Bologna', country: 'IT', phone: '+39 051 630 2200' },
  aerotec: { name: 'Aerotec Kompressoren GmbH', short: 'Aerotec', color: '#455A64', street: 'Ketschendorfer Straße 30', zip: '96450', city: 'Coburg', country: 'DE', phone: '+49 9561 7330 0' },
  lumen: { name: 'Lumen Robotics AB', short: 'Lumen', color: '#EF6C00', street: 'Kopparbergsvägen 10', zip: '722 13', city: 'Västerås', country: 'SE', phone: '+46 21 448 9000' },
  kronfeld: { name: 'Kronfeld Abfülltechnik GmbH', short: 'Kronfeld', color: '#AD1457', street: 'Donaustraße 88', zip: '93073', city: 'Neutraubling', country: 'DE', phone: '+49 9401 7020 0' },
  capsella: { name: 'Capsella Maschinenbau GmbH', short: 'Capsella', color: '#5D4037', street: 'Lechfeldstraße 5', zip: '86343', city: 'Königsbrunn', country: 'DE', phone: '+49 8231 9640 0' },
  transflux: { name: 'Transflux Fördertechnik GmbH', short: 'Transflux', color: '#F4511E', street: 'Logistikring 12', zip: '33334', city: 'Gütersloh', country: 'DE', phone: '+49 5241 3360 0' },
  signa: { name: 'Signa Etikettiertechnik GmbH', short: 'Signa', color: '#7CB342', street: 'Papiermühlweg 4', zip: '35745', city: 'Herborn', country: 'DE', phone: '+49 2772 5810 0' },
  nordvent: { name: 'Nordvent Kältetechnik GmbH', short: 'Nordvent', color: '#0288D1', street: 'Kühlhausstraße 6', zip: '24143', city: 'Kiel', country: 'DE', phone: '+49 431 7140 0' },
  photonix: { name: 'Photonix Lasersysteme GmbH', short: 'Photonix', color: '#8E24AA', street: 'Carl-Zeiss-Promenade 21', zip: '07745', city: 'Jena', country: 'DE', phone: '+49 3641 5530 0' },
  celvia: { name: 'Celvia Energy Storage GmbH', short: 'Celvia', color: '#00A86B', street: 'Kaiserhafen 2', zip: '27568', city: 'Bremerhaven', country: 'DE', phone: '+49 471 9220 0' },
  valtara: { name: 'Valtara Cells Oy', short: 'Valtara', color: '#1E88E5', street: 'Teollisuuskatu 15', zip: '90130', city: 'Oulu', country: 'FI', phone: '+358 8 553 4100' },
  mavrik: { name: 'Mavrik Werkzeugmaschinen GmbH', short: 'Mavrik', color: '#263238', street: 'Fräserweg 1', zip: '87437', city: 'Kempten', country: 'DE', phone: '+49 831 5120 0' },
  haldor: { name: 'Haldor Machine Tools AG', short: 'Haldor', color: '#B71C1C', street: 'Werkstrasse 9', zip: '2540', city: 'Grenchen', country: 'CH', phone: '+41 32 654 1100' },
  mobilis: { name: 'Mobilis Intralogistik GmbH', short: 'Mobilis', color: '#FB8C00', street: 'Hallenstraße 22', zip: '01099', city: 'Dresden', country: 'DE', phone: '+49 351 8870 0' },
}

export const domainOf = key => `${key}.example`

/** Technical properties: concept descriptions (IEC 61360) with unit and definition. */
export const properties = {
  RatedPower: { en: 'Rated power', de: 'Bemessungsleistung', unit: 'kW', type: 'REAL_MEASURE', definition: 'Mechanical output power at rated operating conditions.' },
  RatedVoltage: { en: 'Rated voltage', de: 'Bemessungsspannung', unit: 'V', type: 'REAL_MEASURE', definition: 'Supply voltage the device is designed for.' },
  RatedCurrent: { en: 'Rated current', de: 'Bemessungsstrom', unit: 'A', type: 'REAL_MEASURE', definition: 'Current drawn at rated power and voltage.' },
  RatedSpeed: { en: 'Rated speed', de: 'Bemessungsdrehzahl', unit: '1/min', type: 'REAL_MEASURE', definition: 'Shaft speed at rated operating conditions.' },
  RatedTorque: { en: 'Rated torque', de: 'Bemessungsdrehmoment', unit: 'N·m', type: 'REAL_MEASURE', definition: 'Continuous shaft torque at rated speed.' },
  EfficiencyClass: { en: 'Efficiency class', de: 'Effizienzklasse', unit: '', type: 'STRING', definition: 'Energy efficiency class according to IEC 60034-30-1.' },
  ProtectionClass: { en: 'Degree of protection', de: 'Schutzart', unit: '', type: 'STRING', definition: 'IP code according to IEC 60529.' },
  Weight: { en: 'Weight', de: 'Gewicht', unit: 'kg', type: 'REAL_MEASURE', definition: 'Net weight without packaging.' },
  FlowRate: { en: 'Nominal flow rate', de: 'Nennvolumenstrom', unit: 'm³/h', type: 'REAL_MEASURE', definition: 'Volume flow at the best efficiency point.' },
  MaxPressure: { en: 'Maximum pressure', de: 'Maximaldruck', unit: 'bar', type: 'REAL_MEASURE', definition: 'Highest permissible operating pressure.' },
  NominalDiameter: { en: 'Nominal diameter', de: 'Nennweite', unit: 'mm', type: 'REAL_MEASURE', definition: 'Nominal size (DN) of the process connection.' },
  Material: { en: 'Wetted material', de: 'Werkstoff medienberührt', unit: '', type: 'STRING', definition: 'Material number of the parts in contact with the medium.' },
  SupplyVoltage: { en: 'Supply voltage', de: 'Versorgungsspannung', unit: 'V DC', type: 'REAL_MEASURE', definition: 'Auxiliary supply voltage.' },
  MeasuringRange: { en: 'Measuring range', de: 'Messbereich', unit: '', type: 'STRING', definition: 'Range of the measured quantity with its unit.' },
  Accuracy: { en: 'Accuracy', de: 'Genauigkeit', unit: '%', type: 'REAL_MEASURE', definition: 'Maximum measurement error relative to the span.' },
  DigitalInputs: { en: 'Digital inputs', de: 'Digitale Eingänge', unit: '', type: 'INTEGER_COUNT', definition: 'Number of digital input channels.' },
  DigitalOutputs: { en: 'Digital outputs', de: 'Digitale Ausgänge', unit: '', type: 'INTEGER_COUNT', definition: 'Number of digital output channels.' },
  ScreenSize: { en: 'Screen size', de: 'Bildschirmdiagonale', unit: 'in', type: 'REAL_MEASURE', definition: 'Diagonal of the display.' },
  Payload: { en: 'Payload', de: 'Traglast', unit: 'kg', type: 'REAL_MEASURE', definition: 'Maximum load at the tool flange.' },
  Reach: { en: 'Reach', de: 'Reichweite', unit: 'mm', type: 'REAL_MEASURE', definition: 'Horizontal reach of the wrist centre.' },
  Axes: { en: 'Number of axes', de: 'Anzahl Achsen', unit: '', type: 'INTEGER_COUNT', definition: 'Controlled axes of motion.' },
  Repeatability: { en: 'Pose repeatability', de: 'Wiederholgenauigkeit', unit: 'mm', type: 'REAL_MEASURE', definition: 'Pose repeatability according to ISO 9283.' },
  FreeAirDelivery: { en: 'Free air delivery', de: 'Liefermenge', unit: 'm³/min', type: 'REAL_MEASURE', definition: 'Delivered air volume at intake conditions (ISO 1217).' },
  CoolingCapacity: { en: 'Cooling capacity', de: 'Kälteleistung', unit: 'kW', type: 'REAL_MEASURE', definition: 'Refrigeration capacity at nominal conditions.' },
  LaserPower: { en: 'Laser power', de: 'Laserleistung', unit: 'kW', type: 'REAL_MEASURE', definition: 'Continuous wave optical output power.' },
  Wavelength: { en: 'Wavelength', de: 'Wellenlänge', unit: 'nm', type: 'REAL_MEASURE', definition: 'Emission wavelength of the laser source.' },
  MaxSpindleSpeed: { en: 'Maximum spindle speed', de: 'Maximale Spindeldrehzahl', unit: '1/min', type: 'REAL_MEASURE', definition: 'Highest permissible spindle speed.' },
  SpindlePower: { en: 'Spindle power', de: 'Spindelleistung', unit: 'kW', type: 'REAL_MEASURE', definition: 'Spindle power at 100 % duty cycle.' },
  TravelX: { en: 'Travel X', de: 'Verfahrweg X', unit: 'mm', type: 'REAL_MEASURE', definition: 'Travel of the X axis.' },
  TravelY: { en: 'Travel Y', de: 'Verfahrweg Y', unit: 'mm', type: 'REAL_MEASURE', definition: 'Travel of the Y axis.' },
  TravelZ: { en: 'Travel Z', de: 'Verfahrweg Z', unit: 'mm', type: 'REAL_MEASURE', definition: 'Travel of the Z axis.' },
  NominalVoltage: { en: 'Nominal voltage', de: 'Nennspannung', unit: 'V', type: 'REAL_MEASURE', definition: 'Nominal voltage of the battery.' },
  Capacity: { en: 'Rated capacity', de: 'Nennkapazität', unit: 'Ah', type: 'REAL_MEASURE', definition: 'Rated charge capacity at 0.2 C, 25 °C.' },
  Energy: { en: 'Nominal energy', de: 'Nennenergie', unit: 'kWh', type: 'REAL_MEASURE', definition: 'Usable energy content.' },
  CellChemistry: { en: 'Cell chemistry', de: 'Zellchemie', unit: '', type: 'STRING', definition: 'Cathode chemistry of the cells.' },
  CycleLife: { en: 'Cycle life', de: 'Zyklenfestigkeit', unit: 'cycles', type: 'INTEGER_COUNT', definition: 'Full cycles until 80 % state of health.' },
  Resolution: { en: 'Resolution', de: 'Auflösung', unit: 'MP', type: 'REAL_MEASURE', definition: 'Sensor resolution.' },
  FrameRate: { en: 'Frame rate', de: 'Bildrate', unit: 'fps', type: 'REAL_MEASURE', definition: 'Images per second at full resolution.' },
  BatteryCapacity: { en: 'Battery capacity', de: 'Batteriekapazität', unit: 'kWh', type: 'REAL_MEASURE', definition: 'Energy content of the traction battery.' },
  MaxSpeed: { en: 'Maximum travel speed', de: 'Maximale Fahrgeschwindigkeit', unit: 'm/s', type: 'REAL_MEASURE', definition: 'Highest travel speed without load.' },
  Throughput: { en: 'Throughput', de: 'Ausbringung', unit: 'units/h', type: 'REAL_MEASURE', definition: 'Nominal output of the machine.' },
}

/** Live signals: unit and limits (WarningAbove/AlarmAbove or …Below). */
const signal = (idShort, unit, base, swing, limits = {}, digits = 1) => ({ idShort, unit, base, swing, digits, ...limits })

/**
 * Component families. `technical(r)` returns the technical properties of one
 * instance (r: random helpers); `pcf` its cradle-to-gate footprint in kg CO₂e.
 */
export const families = {
  motorIE4: {
    noun: 'Motor', name: 'VX3 IE4 Synchronous Motor', maker: 'voltrix', icon: 'mdi-engine', classification: 'Three-phase synchronous motor',
    technical: r => {
      const power = r.pick([1.5, 2.2, 4, 5.5, 7.5, 11, 15, 22])
      return { RatedPower: power, RatedVoltage: 400, RatedCurrent: r.round(power * 1.85, 1), RatedSpeed: 1500, RatedTorque: r.round(power * 9550 / 1500, 1), EfficiencyClass: 'IE4', ProtectionClass: 'IP55', Weight: r.round(power * 5.6 + 9, 1) }
    },
    pcf: t => t.Weight * 9.2,
    signals: [signal('WindingTemperature', '°C', 64, 7, { warn: 80, alarm: 90 }), signal('Vibration', 'mm/s', 1.5, 0.5, { warn: 4.5, alarm: 7.1 }, 2), signal('Speed', '1/min', 1490, 12, {}, 0)],
  },
  motorIE3: {
    noun: 'Motor', name: 'NM-Series IE3 Motor', maker: 'nordwerk', icon: 'mdi-engine', classification: 'Three-phase asynchronous motor',
    technical: r => {
      const power = r.pick([0.75, 1.1, 2.2, 4, 7.5, 18.5, 30, 45, 75])
      return { RatedPower: power, RatedVoltage: 400, RatedCurrent: r.round(power * 2, 1), RatedSpeed: r.pick([1460, 2930]), EfficiencyClass: 'IE3', ProtectionClass: 'IP55', Weight: r.round(power * 7.1 + 11, 1) }
    },
    pcf: t => t.Weight * 9.8,
    signals: [signal('WindingTemperature', '°C', 66, 8, { warn: 80, alarm: 90 }), signal('Vibration', 'mm/s', 1.8, 0.6, { warn: 4.5, alarm: 7.1 }, 2)],
  },
  servo: {
    noun: 'Servo motor', name: 'K-Line Servo Motor', maker: 'kessler', icon: 'mdi-cog-transfer', classification: 'Permanent-magnet servo motor',
    technical: r => {
      const torque = r.pick([2.4, 4.8, 9.5, 18, 32])
      return { RatedTorque: torque, RatedSpeed: 3000, RatedPower: r.round(torque * 3000 / 9550, 2), RatedVoltage: 400, ProtectionClass: 'IP65', Weight: r.round(torque * 0.42 + 2.5, 1) }
    },
    pcf: t => t.Weight * 14,
    signals: [signal('WindingTemperature', '°C', 58, 8, { warn: 110, alarm: 130 })],
  },
  drive: {
    noun: 'Frequency converter', name: 'VXD-500 Frequency Converter', maker: 'voltrix', icon: 'mdi-sine-wave', classification: 'Frequency converter',
    technical: r => ({ RatedPower: r.pick([2.2, 4, 7.5, 11, 22, 45]), RatedVoltage: 400, ProtectionClass: r.pick(['IP20', 'IP55']), Weight: r.round(r.between(3, 22), 1) }),
    pcf: t => t.Weight * 21,
    signals: [signal('HeatsinkTemperature', '°C', 47, 6, { warn: 75, alarm: 85 })],
  },
  servoDrive: {
    noun: 'Servo drive', name: 'K-Drive Multi-Axis Servo Drive', maker: 'kessler', icon: 'mdi-sine-wave', classification: 'Servo amplifier',
    technical: r => ({ RatedCurrent: r.pick([8, 16, 32]), RatedVoltage: 400, Axes: r.pick([2, 3]), ProtectionClass: 'IP20', Weight: r.round(r.between(4, 9), 1) }),
    pcf: t => t.Weight * 24,
    signals: [signal('HeatsinkTemperature', '°C', 45, 5, { warn: 75, alarm: 85 })],
  },
  pump: {
    noun: 'Centrifugal pump', name: 'HCP Hygienic Centrifugal Pump', maker: 'hydra', icon: 'mdi-pump', classification: 'Centrifugal pump, hygienic design',
    technical: r => {
      const power = r.pick([3, 5.5, 7.5, 11, 18.5, 30])
      return { RatedPower: power, FlowRate: r.round(power * 4.4, 0), MaxPressure: r.pick([10, 16]), NominalDiameter: r.pick([40, 50, 65]), Material: '1.4404', ProtectionClass: 'IP55', Weight: r.round(power * 3.8 + 26, 1) }
    },
    pcf: t => t.Weight * 7.9,
    signals: [signal('DischargePressure', 'bar', 4.2, 0.4, { warn: 8.5, alarm: 9.5 }, 2), signal('FlowRate', 'm³/h', 22, 3)],
  },
  inlinePump: {
    noun: 'Inline pump', name: 'AQ-Inline Circulation Pump', maker: 'aquilon', icon: 'mdi-water-pump', classification: 'Inline circulation pump',
    technical: r => {
      const power = r.pick([1.5, 2.2, 4, 7.5])
      return { RatedPower: power, FlowRate: r.round(power * 6, 0), MaxPressure: 10, NominalDiameter: r.pick([50, 65, 80]), Material: '1.4301', Weight: r.round(power * 4 + 18, 1) }
    },
    pcf: t => t.Weight * 7.4,
    signals: [signal('DischargePressure', 'bar', 3.1, 0.3, { warn: 7.5, alarm: 9 }, 2)],
  },
  valve: {
    noun: 'Double-seat valve', name: 'BV Double Seat Valve', maker: 'brennecke', icon: 'mdi-pipe-valve', classification: 'Hygienic double-seat valve',
    technical: r => ({ NominalDiameter: r.pick([40, 50, 65, 80, 100]), MaxPressure: 10, Material: '1.4404', ProtectionClass: 'IP67', Weight: r.round(r.between(6, 18), 1) }),
    pcf: t => t.Weight * 6.3,
  },
  butterfly: {
    noun: 'Butterfly valve', name: 'AV Butterfly Valve', maker: 'aquilon', icon: 'mdi-pipe-valve', classification: 'Butterfly valve',
    technical: r => ({ NominalDiameter: r.pick([25, 40, 50, 65]), MaxPressure: 16, Material: '1.4404', Weight: r.round(r.between(1.2, 5), 1) }),
    pcf: t => t.Weight * 6,
  },
  pressure: {
    noun: 'Pressure transmitter', name: 'BL-P20 Pressure Transmitter', maker: 'brightline', icon: 'mdi-gauge', classification: 'Pressure transmitter',
    technical: r => ({ MeasuringRange: r.pick(['0 … 10 bar', '0 … 16 bar', '-1 … 6 bar']), Accuracy: 0.1, SupplyVoltage: 24, ProtectionClass: 'IP69K', Weight: 0.35 }),
    pcf: () => 13.1,
  },
  level: {
    noun: 'Level radar', name: 'LT-R80 Level Radar', maker: 'lumetra', icon: 'mdi-radar', classification: 'Radar level sensor',
    technical: r => ({ MeasuringRange: r.pick(['0 … 15 m', '0 … 30 m']), Accuracy: 0.05, SupplyVoltage: 24, ProtectionClass: 'IP68', Weight: 1.4 }),
    pcf: () => 41.5,
  },
  flow: {
    noun: 'Flow meter', name: 'BL-M Magnetic Flow Meter', maker: 'brightline', icon: 'mdi-waves', classification: 'Electromagnetic flow meter',
    technical: r => ({ NominalDiameter: r.pick([25, 40, 50]), Accuracy: 0.2, SupplyVoltage: 24, ProtectionClass: 'IP67', Weight: r.round(r.between(3, 7), 1) }),
    pcf: t => t.Weight * 19,
  },
  temperature: {
    noun: 'Temperature probe', name: 'BL-T Pt100 Temperature Probe', maker: 'brightline', icon: 'mdi-thermometer', classification: 'Resistance thermometer',
    technical: () => ({ MeasuringRange: '-50 … 250 °C', Accuracy: 0.15, SupplyVoltage: 24, ProtectionClass: 'IP69K', Weight: 0.2 }),
    pcf: () => 6.4,
  },
  camera: {
    noun: 'Vision camera', name: 'LT-Vision 12 Smart Camera', maker: 'lumetra', icon: 'mdi-camera-iris', classification: 'Industrial smart camera',
    technical: r => ({ Resolution: r.pick([5, 12]), FrameRate: r.pick([60, 120]), SupplyVoltage: 24, ProtectionClass: 'IP67', Weight: 0.45 }),
    pcf: () => 28,
  },
  plc: {
    noun: 'Controller', name: 'Orbis OC-1500 Controller', maker: 'orbis', icon: 'mdi-memory', classification: 'Programmable logic controller',
    technical: r => ({ DigitalInputs: r.pick([32, 64]), DigitalOutputs: r.pick([16, 32]), SupplyVoltage: 24, ProtectionClass: 'IP20', Weight: r.round(r.between(0.8, 2.4), 2) }),
    pcf: t => t.Weight * 55,
    signals: [signal('CpuLoad', '%', 32, 12, { warn: 85, alarm: 95 }, 0)],
  },
  plcTecnova: {
    noun: 'Controller', name: 'Tecnova TX-Edge Controller', maker: 'tecnova', icon: 'mdi-memory', classification: 'Edge controller',
    technical: r => ({ DigitalInputs: 32, DigitalOutputs: 16, SupplyVoltage: 24, ProtectionClass: 'IP20', Weight: r.round(r.between(0.9, 1.6), 2) }),
    pcf: t => t.Weight * 61,
    signals: [signal('CpuLoad', '%', 41, 10, { warn: 85, alarm: 95 }, 0)],
  },
  hmi: {
    noun: 'HMI panel', name: 'Orbis Vision Touch Panel', maker: 'orbis', icon: 'mdi-monitor-dashboard', classification: 'Operator panel',
    technical: r => ({ ScreenSize: r.pick([12.1, 15.6, 21.5]), SupplyVoltage: 24, ProtectionClass: 'IP65', Weight: r.round(r.between(2.5, 6), 1) }),
    pcf: t => t.Weight * 48,
  },
  compressor: {
    noun: 'Screw compressor', name: 'ATS Oil-free Screw Compressor', maker: 'aerotec', icon: 'mdi-air-filter', classification: 'Oil-free screw compressor',
    technical: r => ({ RatedPower: r.pick([45, 55, 75, 90]), MaxPressure: 10, FreeAirDelivery: r.round(r.between(6, 15), 1), Weight: r.round(r.between(1100, 2100), 0) }),
    pcf: t => t.Weight * 4.2,
    signals: [signal('OutletPressure', 'bar', 7.4, 0.3, { warn: 9.2, alarm: 9.8 }, 2), signal('OilTemperature', '°C', 72, 5, { warn: 95, alarm: 105 })],
  },
  robot: {
    noun: 'Industrial robot', name: 'LR-6 Six-Axis Robot', maker: 'lumen', icon: 'mdi-robot-industrial', classification: 'Articulated robot',
    technical: r => ({ Payload: r.pick([12, 25, 70, 210]), Reach: r.pick([1450, 2100, 2650]), Axes: 6, Repeatability: 0.03, RatedPower: r.pick([4, 7.5, 11]), Weight: r.round(r.between(150, 1150), 0) }),
    pcf: t => t.Weight * 6.8,
    signals: [signal('CycleTime', 's', 6.1, 0.4, { warn: 8, alarm: 10 }), signal('JointTemperature', '°C', 49, 5, { warn: 70, alarm: 80 })],
  },
  palletRobot: {
    noun: 'Palletizing robot', name: 'LR-4 Palletizing Robot', maker: 'lumen', icon: 'mdi-robot-industrial', classification: 'Palletizing robot',
    technical: r => ({ Payload: r.pick([160, 240, 315]), Reach: r.pick([2400, 3100]), Axes: 4, Repeatability: 0.05, RatedPower: 11, Weight: r.round(r.between(980, 1350), 0) }),
    pcf: t => t.Weight * 6.6,
    signals: [signal('CycleTime', 's', 6.2, 0.4, { warn: 8, alarm: 10 })],
  },
  laser: {
    noun: 'Laser source', name: 'PX-6 Fiber Laser Source', maker: 'photonix', icon: 'mdi-flash', classification: 'Fiber laser source',
    technical: r => ({ LaserPower: r.pick([4, 6, 8]), Wavelength: 1070, RatedVoltage: 400, ProtectionClass: 'IP54', Weight: r.round(r.between(180, 320), 0) }),
    pcf: t => t.Weight * 11.5,
    signals: [signal('LaserPower', 'kW', 5.8, 0.2, { warnBelow: 5.2, alarmBelow: 4.8 }, 2), signal('CoolantTemperature', '°C', 22, 0.8, { warn: 26, alarm: 28 })],
  },
  chillerUnit: {
    noun: 'Chiller', name: 'NV-Chill Recirculating Chiller', maker: 'nordvent', icon: 'mdi-snowflake', classification: 'Recirculating chiller',
    technical: r => ({ CoolingCapacity: r.pick([8, 15, 30]), RatedPower: r.pick([4, 7.5, 11]), RatedVoltage: 400, Weight: r.round(r.between(160, 420), 0) }),
    pcf: t => t.Weight * 7.2,
    signals: [signal('SupplyTemperature', '°C', 18, 0.6, { warn: 22, alarm: 25 })],
  },
  spindle: {
    noun: 'Motor spindle', name: 'MS-24 Motor Spindle', maker: 'kessler', icon: 'mdi-rotate-orbit', classification: 'Motor spindle',
    technical: r => ({ MaxSpindleSpeed: r.pick([18_000, 24_000, 30_000]), SpindlePower: r.pick([25, 35, 46]), RatedTorque: r.pick([87, 120, 180]), Weight: r.round(r.between(55, 110), 0) }),
    pcf: t => t.Weight * 13,
    signals: [signal('SpindleLoad', '%', 46, 14, { warn: 90, alarm: 100 }, 0), signal('BearingTemperature', '°C', 38, 4, { warn: 55, alarm: 65 })],
  },
  agv: {
    noun: 'Autonomous mobile robot', name: 'Mobilis M-600 Autonomous Mobile Robot', maker: 'mobilis', icon: 'mdi-forklift', classification: 'Autonomous mobile robot',
    technical: r => ({ Payload: r.pick([600, 1000]), MaxSpeed: 2, BatteryCapacity: r.pick([4.8, 7.2]), ProtectionClass: 'IP54', Weight: r.round(r.between(380, 520), 0) }),
    pcf: t => t.Weight * 9.4,
    signals: [signal('BatteryLevel', '%', 68, 18, { warnBelow: 25, alarmBelow: 10 }, 0)],
  },
  batteryModule: {
    noun: 'Battery module', name: 'Celvia BM-48 Battery Module', maker: 'celvia', icon: 'mdi-battery-high', classification: 'Lithium-ion battery module',
    technical: () => ({ NominalVoltage: 48, Capacity: 104, Energy: 5, CellChemistry: 'NMC 811', CycleLife: 4000, Weight: 31.5 }),
    pcf: t => t.Energy * 71,
  },
}

/** Machines: assemblies of components, built by an OEM. */
export const machines = {
  rinser: { noun: 'Rinser', maker: 'kronfeld', icon: 'mdi-water', parts: ['motorIE4', 'drive', 'pump', 'valve', 'valve', 'pressure', 'plc'], throughput: 36_000 },
  filler: { noun: 'Rotary filler', maker: 'kronfeld', icon: 'mdi-bottle-soda-classic', parts: ['motorIE4', 'motorIE4', 'drive', 'drive', 'pump', 'valve', 'valve', 'valve', 'level', 'flow', 'pressure', 'plc', 'hmi'], throughput: 36_000 },
  capper: { noun: 'Capper', maker: 'capsella', icon: 'mdi-bottle-tonic', parts: ['servo', 'servo', 'servoDrive', 'camera', 'plcTecnova'], throughput: 36_000 },
  inspector: { noun: 'Inspection unit', maker: 'lumetra', icon: 'mdi-eye', parts: ['camera', 'camera', 'plc'], throughput: 48_000 },
  conveyor: { noun: 'Bottle conveyor', maker: 'transflux', icon: 'mdi-transfer-right', parts: ['motorIE3', 'drive', 'pressure'], throughput: 48_000 },
  labeler: { noun: 'Labeler', maker: 'signa', icon: 'mdi-label', parts: ['servo', 'servo', 'servoDrive', 'camera', 'plcTecnova', 'hmi'], throughput: 36_000 },
  packer: { noun: 'Shrink packer', maker: 'capsella', icon: 'mdi-package-variant-closed', parts: ['motorIE3', 'motorIE3', 'drive', 'temperature', 'plcTecnova'], throughput: 2400 },
  palletizer: { noun: 'Palletizer cell', maker: 'lumen', icon: 'mdi-robot-industrial', parts: ['palletRobot', 'motorIE3', 'drive', 'camera', 'plc'], throughput: 180 },
  wrapper: { noun: 'Stretch wrapper', maker: 'transflux', icon: 'mdi-package-variant', parts: ['motorIE3', 'drive', 'pressure'], throughput: 60 },
  compressors: { noun: 'Compressed air station', maker: 'aerotec', icon: 'mdi-air-filter', parts: ['compressor', 'compressor', 'pressure', 'butterfly', 'plc'] },
  chiller: { noun: 'Process chiller', maker: 'nordvent', icon: 'mdi-snowflake', parts: ['motorIE3', 'inlinePump', 'inlinePump', 'temperature', 'plc'] },
  cip: { noun: 'CIP skid', maker: 'aquilon', icon: 'mdi-water-sync', parts: ['pump', 'pump', 'valve', 'valve', 'butterfly', 'temperature', 'flow', 'plc'] },
  water: { noun: 'Water treatment', maker: 'aquilon', icon: 'mdi-water-sync', parts: ['inlinePump', 'inlinePump', 'butterfly', 'pressure', 'flow'] },
  stacker: { noun: 'Cell stacking cell', maker: 'lumen', icon: 'mdi-layers-triple', parts: ['robot', 'robot', 'camera', 'servoDrive', 'plc', 'hmi'], throughput: 40 },
  welder: { noun: 'Laser welding station', maker: 'photonix', icon: 'mdi-flash', parts: ['laser', 'chillerUnit', 'robot', 'camera', 'servo', 'servoDrive', 'plc'], throughput: 40 },
  tester: { noun: 'End-of-line tester', maker: 'lumetra', icon: 'mdi-flask', parts: ['temperature', 'temperature', 'camera', 'plcTecnova', 'hmi'], throughput: 40 },
  moduleConveyor: { noun: 'Module conveyor', maker: 'transflux', icon: 'mdi-transfer-right', parts: ['servo', 'servoDrive', 'camera'], throughput: 60 },
  mill: { noun: '5-axis machining center', maker: 'mavrik', icon: 'mdi-cog', parts: ['spindle', 'servo', 'servo', 'servo', 'servo', 'servo', 'servoDrive', 'servoDrive', 'chillerUnit', 'plc', 'hmi'], throughput: 12 },
  lathe: { noun: 'CNC turning center', maker: 'haldor', icon: 'mdi-rotate-3d-variant', parts: ['spindle', 'servo', 'servo', 'servoDrive', 'inlinePump', 'plcTecnova', 'hmi'], throughput: 30 },
  loader: { noun: 'Robot loading cell', maker: 'lumen', icon: 'mdi-robot-industrial', parts: ['robot', 'camera', 'plc'], throughput: 40 },
  cmm: { noun: 'Coordinate measuring machine', maker: 'lumetra', icon: 'mdi-ruler-square', parts: ['servo', 'servo', 'servo', 'temperature', 'plc', 'hmi'], throughput: 8 },
  coolant: { noun: 'Central coolant system', maker: 'aquilon', icon: 'mdi-water-pump', parts: ['pump', 'pump', 'butterfly', 'temperature', 'flow', 'plc'] },
}

/** Sites: lines of machines, plus loose twins (spare parts, mobile robots, finished goods). */
export const sites = [
  {
    key: 'rheinfeld',
    name: 'Rheinfeld Bottling Plant',
    operator: 'Rheinfeld Getränke GmbH',
    icon: 'mdi-factory',
    lines: [
      { key: 'l1', name: 'Line 1 – Filling', machines: ['rinser', 'conveyor', 'filler', 'capper', 'inspector', 'conveyor'] },
      { key: 'l2', name: 'Line 2 – Labeling & Packaging', machines: ['conveyor', 'labeler', 'conveyor', 'packer', 'palletizer', 'wrapper'] },
      { key: 'ut', name: 'Utilities', machines: ['compressors', 'chiller', 'cip', 'water'] },
    ],
    spares: ['motorIE4', 'motorIE3', 'motorIE3', 'pump', 'drive', 'valve', 'pressure', 'plc'],
  },
  {
    key: 'nordhafen',
    name: 'Nordhafen Battery Module Plant',
    operator: 'Celvia Energy Storage GmbH',
    icon: 'mdi-factory',
    lines: [
      { key: 'a1', name: 'Assembly 1 – Stacking', machines: ['moduleConveyor', 'stacker', 'stacker', 'moduleConveyor'] },
      { key: 'a2', name: 'Assembly 2 – Laser welding', machines: ['welder', 'welder', 'moduleConveyor'] },
      { key: 'eol', name: 'End-of-line testing', machines: ['tester', 'tester', 'moduleConveyor'] },
      { key: 'ut', name: 'Utilities', machines: ['compressors', 'chiller'] },
    ],
    mobile: { name: 'Intralogistics fleet', family: 'agv', count: 5 },
    goods: { name: 'Dispatch pallet', family: 'batteryModule', pallets: 2, perPallet: 12 },
    spares: ['servo', 'servo', 'servoDrive', 'camera', 'laser'],
  },
  {
    key: 'lindental',
    name: 'Lindental Machining Center',
    operator: 'Lindental Präzisionsteile GmbH',
    icon: 'mdi-factory',
    lines: [
      { key: 'ca', name: 'Cell A – 5-axis milling', machines: ['mill', 'mill', 'mill', 'loader'] },
      { key: 'cb', name: 'Cell B – Turning', machines: ['lathe', 'lathe', 'loader'] },
      { key: 'qa', name: 'Quality lab', machines: ['cmm'] },
      { key: 'ut', name: 'Utilities', machines: ['coolant', 'compressors'] },
    ],
    mobile: { name: 'Intralogistics fleet', family: 'agv', count: 3 },
    spares: ['spindle', 'servo', 'servo', 'servoDrive', 'motorIE4'],
  },
]

/** Documents of a family (VDI 2770 class) and the markings of every product. */
export const documentKinds = [
  { key: 'operating-instructions', title: 'Operating instructions', classId: '03-02', className: 'Operation', kind: 'manual' },
  { key: 'data-sheet', title: 'Data sheet', classId: '02-01', className: 'Technical specification', kind: 'datasheet' },
  { key: 'declaration-of-conformity', title: 'EU declaration of conformity', classId: '02-04', className: 'Certificates, declarations', kind: 'conformity' },
]

export const markings = [
  { key: 'ce', name: 'CE', certificate: 'EU declaration of conformity' },
  { key: 'ukca', name: 'UKCA', certificate: 'UK declaration of conformity' },
  { key: 'rohs', name: 'RoHS', certificate: 'Directive 2011/65/EU' },
  { key: 'weee', name: 'WEEE', certificate: 'Directive 2012/19/EU' },
]
