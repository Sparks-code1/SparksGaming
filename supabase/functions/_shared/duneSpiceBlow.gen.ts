// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/spiceBlow.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact spice deck and blow the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/data/dune/boardData.ts
var DUNE_TERRITORIES = [
  {
    id: "territory-01",
    displayName: "False Wall East",
    sectors: ["sector-5", "sector-6", "sector-7", "sector-8", "sector-9"],
    centroid: { x: 561.1, y: 585.65 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-02", "territory-03", "territory-05", "territory-06", "territory-07"],
    cells: [
      { sector: "sector-5", at: { x: 554.93, y: 596.53 }, areaShare: 0.192, room: 16.1 },
      { sector: "sector-6", at: { x: 568.73, y: 572.28 }, areaShare: 0.226, room: 22.1 },
      { sector: "sector-7", at: { x: 575.26, y: 540.39 }, areaShare: 0.221, room: 20.3 },
      { sector: "sector-8", at: { x: 565.11, y: 510.34 }, areaShare: 0.22, room: 19.3 },
      { sector: "sector-9", at: { x: 544.97, y: 493.23 }, areaShare: 0.136, room: 7.6 }
    ]
  },
  {
    id: "territory-02",
    displayName: "Harg Pass",
    sectors: ["sector-4", "sector-5"],
    centroid: { x: 576.76, y: 626.36 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-01", "territory-03", "territory-07", "territory-08", "territory-17"],
    cells: [
      { sector: "sector-4", at: { x: 547.62, y: 635.05 }, areaShare: 0.692, room: 16.6 },
      { sector: "sector-5", at: { x: 580.41, y: 622.41 }, areaShare: 0.303, room: 15.7 }
    ]
  },
  {
    id: "territory-03",
    displayName: "Polar Sink",
    sectors: ["sector-1", "sector-2", "sector-3", "sector-4", "sector-5", "sector-6", "sector-7", "sector-8", "sector-9", "sector-10", "sector-11", "sector-12", "sector-13", "sector-14", "sector-15", "sector-16", "sector-17", "sector-18"],
    centroid: { x: 481.28, y: 565.99 },
    terrain: "polar-sink",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-01", "territory-02", "territory-04", "territory-05", "territory-08", "territory-09", "territory-11", "territory-12"],
    cells: [
      { sector: "sector-1", at: { x: 468.11, y: 600.85 }, areaShare: 0.062, room: 19.5 },
      { sector: "sector-2", at: { x: 483.27, y: 609.33 }, areaShare: 0.078, room: 26 },
      { sector: "sector-3", at: { x: 500.07, y: 604.39 }, areaShare: 0.072, room: 21.4 },
      { sector: "sector-4", at: { x: 509.27, y: 588.22 }, areaShare: 0.053, room: 19.7 },
      { sector: "sector-5", at: { x: 516.83, y: 575.91 }, areaShare: 0.04, room: 18.8 },
      { sector: "sector-6", at: { x: 523.89, y: 563.35 }, areaShare: 0.05, room: 18.8 },
      { sector: "sector-7", at: { x: 529.17, y: 548.09 }, areaShare: 0.061, room: 22.4 },
      { sector: "sector-8", at: { x: 525.11, y: 533.1 }, areaShare: 0.064, room: 20.2 },
      { sector: "sector-9", at: { x: 508.56, y: 528.35 }, areaShare: 0.044, room: 13.1 },
      { sector: "sector-10", at: { x: 493.99, y: 525.84 }, areaShare: 0.028, room: 12.6 },
      { sector: "sector-11", at: { x: 483.56, y: 523.03 }, areaShare: 0.032, room: 16.1 },
      { sector: "sector-12", at: { x: 472.77, y: 527.39 }, areaShare: 0.028, room: 16.2 },
      { sector: "sector-13", at: { x: 460.4, y: 529.54 }, areaShare: 0.033, room: 14.4 },
      { sector: "sector-14", at: { x: 447.68, y: 536.25 }, areaShare: 0.051, room: 18.5 },
      { sector: "sector-15", at: { x: 435.57, y: 548.62 }, areaShare: 0.066, room: 21.9 },
      { sector: "sector-16", at: { x: 428.43, y: 566.89 }, areaShare: 0.089, room: 25.3 },
      { sector: "sector-17", at: { x: 436.05, y: 583 }, areaShare: 0.087, room: 24.6 },
      { sector: "sector-18", at: { x: 452.01, y: 592.93 }, areaShare: 0.063, room: 18.7 }
    ]
  },
  {
    id: "territory-04",
    displayName: "Wind Pass",
    sectors: ["sector-14", "sector-15", "sector-16", "sector-17"],
    centroid: { x: 373.1, y: 571.41 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-03", "territory-09", "territory-10", "territory-11", "territory-19", "territory-21", "territory-22", "territory-24"],
    cells: [
      { sector: "sector-14", at: { x: 407.15, y: 514.27 }, areaShare: 0.171, room: 15.1 },
      { sector: "sector-15", at: { x: 388.25, y: 540.48 }, areaShare: 0.193, room: 16.7 },
      { sector: "sector-16", at: { x: 370.37, y: 577.16 }, areaShare: 0.314, room: 22 },
      { sector: "sector-17", at: { x: 354.46, y: 635.05 }, areaShare: 0.317, room: 14.7 }
    ]
  },
  {
    id: "territory-05",
    displayName: "Imperial Basin",
    sectors: ["sector-9", "sector-10", "sector-11"],
    centroid: { x: 554.75, y: 346.54 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-01", "territory-03", "territory-06", "territory-12", "territory-13", "territory-14", "territory-15", "territory-25", "territory-26", "territory-27"],
    cells: [
      { sector: "sector-9", at: { x: 570.48, y: 422.65 }, areaShare: 0.11, room: 6.8 },
      { sector: "sector-10", at: { x: 554.29, y: 337.27 }, areaShare: 0.671, room: 56.5 },
      { sector: "sector-11", at: { x: 517.51, y: 305.89 }, areaShare: 0.219, room: 9.9 }
    ]
  },
  {
    id: "territory-06",
    displayName: "Shield Wall",
    sectors: ["sector-8", "sector-9"],
    centroid: { x: 617.88, y: 432.31 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-01", "territory-05", "territory-07", "territory-15", "territory-16", "territory-29", "territory-30"],
    cells: [
      { sector: "sector-8", at: { x: 677.46, y: 411.35 }, areaShare: 0.393, room: 15.8 },
      { sector: "sector-9", at: { x: 656.65, y: 389.67 }, areaShare: 0.607, room: 18.1 }
    ]
  },
  {
    id: "territory-07",
    displayName: "The Minor Erg",
    sectors: ["sector-5", "sector-6", "sector-7", "sector-8"],
    centroid: { x: 639.58, y: 515.04 },
    terrain: "sand",
    spiceSector: "sector-8",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-01", "territory-02", "territory-06", "territory-16", "territory-17"],
    cells: [
      { sector: "sector-5", at: { x: 631.51, y: 632.77 }, areaShare: 0.16, room: 8.8 },
      { sector: "sector-6", at: { x: 631.22, y: 583.45 }, areaShare: 0.267, room: 34.9 },
      { sector: "sector-7", at: { x: 643.41, y: 529.22 }, areaShare: 0.343, room: 40.6 },
      { sector: "sector-8", at: { x: 633.76, y: 483.43 }, areaShare: 0.229, room: 13.7 }
    ]
  },
  {
    id: "territory-08",
    displayName: "Cielago North",
    sectors: ["sector-1", "sector-2", "sector-3"],
    centroid: { x: 486.07, y: 708.92 },
    terrain: "sand",
    spiceSector: "sector-3",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-02", "territory-03", "territory-09", "territory-17", "territory-18", "territory-19", "territory-34"],
    cells: [
      { sector: "sector-1", at: { x: 426.99, y: 713.81 }, areaShare: 0.344, room: 29.1 },
      { sector: "sector-2", at: { x: 485.37, y: 726.96 }, areaShare: 0.332, room: 55 },
      { sector: "sector-3", at: { x: 537.04, y: 715.78 }, areaShare: 0.323, room: 32.5 }
    ]
  },
  {
    id: "territory-09",
    displayName: "Wind Pass North",
    sectors: ["sector-17", "sector-18"],
    centroid: { x: 404.92, y: 630.59 },
    terrain: "sand",
    spiceSector: "sector-17",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-03", "territory-04", "territory-08", "territory-19"],
    cells: [
      { sector: "sector-17", at: { x: 391.96, y: 616.95 }, areaShare: 0.25, room: 14.6 },
      { sector: "sector-18", at: { x: 398.42, y: 663.48 }, areaShare: 0.75, room: 20.6 }
    ]
  },
  {
    id: "territory-10",
    displayName: "False Wall West",
    sectors: ["sector-16", "sector-17", "sector-18"],
    centroid: { x: 289.11, y: 697.08 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-19", "territory-20", "territory-21", "territory-37"],
    cells: [
      { sector: "sector-16", at: { x: 313.93, y: 602.56 }, areaShare: 0.147, room: 12.6 },
      { sector: "sector-17", at: { x: 294.51, y: 675.42 }, areaShare: 0.508, room: 25.6 },
      { sector: "sector-18", at: { x: 288.51, y: 759.59 }, areaShare: 0.345, room: 13 }
    ]
  },
  {
    id: "territory-11",
    displayName: "Hagga Basin",
    sectors: ["sector-12", "sector-13"],
    centroid: { x: 373.43, y: 377.62 },
    terrain: "sand",
    spiceSector: "sector-13",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-03", "territory-04", "territory-12", "territory-24", "territory-25", "territory-26"],
    cells: [
      { sector: "sector-12", at: { x: 406.14, y: 352.65 }, areaShare: 0.475, room: 40.6 },
      { sector: "sector-13", at: { x: 368.34, y: 414.37 }, areaShare: 0.515, room: 36.3 }
    ]
  },
  {
    id: "territory-12",
    displayName: "Arsunt",
    sectors: ["sector-11", "sector-12"],
    centroid: { x: 466.57, y: 436.74 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-03", "territory-05", "territory-11", "territory-26"],
    cells: [
      { sector: "sector-11", at: { x: 475.2, y: 404.59 }, areaShare: 0.665, room: 17.9 },
      { sector: "sector-12", at: { x: 452.42, y: 443.99 }, areaShare: 0.329, room: 15.8 }
    ]
  },
  {
    id: "territory-13",
    displayName: "Arrakeen",
    sectors: ["sector-10"],
    centroid: { x: 628.39, y: 236.63 },
    terrain: "stronghold",
    spiceSector: null,
    stronghold: true,
    spiceBlow: null,
    spiceIncome: 2,
    ornithopters: true,
    adjacent: ["territory-05", "territory-14", "territory-27"],
    cells: [
      { sector: "sector-10", at: { x: 620.09, y: 246.94 }, areaShare: 0.997, room: 33.3 }
    ]
  },
  {
    id: "territory-14",
    displayName: "Rim Wall West",
    sectors: ["sector-9"],
    centroid: { x: 657.39, y: 286.61 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-05", "territory-13", "territory-15", "territory-27", "territory-28"],
    cells: [
      { sector: "sector-9", at: { x: 652.52, y: 292.51 }, areaShare: 1, room: 12.3 }
    ]
  },
  {
    id: "territory-15",
    displayName: "Hole In The Rock",
    sectors: ["sector-9"],
    centroid: { x: 685.42, y: 323.42 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-05", "territory-06", "territory-14", "territory-28", "territory-29"],
    cells: [
      { sector: "sector-9", at: { x: 673.37, y: 331.76 }, areaShare: 1, room: 20.9 }
    ]
  },
  {
    id: "territory-16",
    displayName: "Pasty Mesa",
    sectors: ["sector-5", "sector-6", "sector-7", "sector-8"],
    centroid: { x: 772, y: 576.44 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-06", "territory-07", "territory-17", "territory-30", "territory-31", "territory-32", "territory-33"],
    cells: [
      { sector: "sector-5", at: { x: 729.82, y: 663.78 }, areaShare: 0.078, room: 18.8 },
      { sector: "sector-6", at: { x: 778.17, y: 611.94 }, areaShare: 0.343, room: 64.1 },
      { sector: "sector-7", at: { x: 787.81, y: 501.76 }, areaShare: 0.342, room: 61.3 },
      { sector: "sector-8", at: { x: 770.25, y: 419.48 }, areaShare: 0.236, room: 40.9 }
    ]
  },
  {
    id: "territory-17",
    displayName: "False Wall South",
    sectors: ["sector-4", "sector-5"],
    centroid: { x: 691.91, y: 747.26 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-02", "territory-07", "territory-08", "territory-16", "territory-32", "territory-33", "territory-34"],
    cells: [
      { sector: "sector-4", at: { x: 665.4, y: 761.08 }, areaShare: 0.671, room: 42.6 },
      { sector: "sector-5", at: { x: 696.14, y: 703.84 }, areaShare: 0.327, room: 30.6 }
    ]
  },
  {
    id: "territory-18",
    displayName: "Cielago Depression",
    sectors: ["sector-1", "sector-2", "sector-3"],
    centroid: { x: 469.19, y: 829.8 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-08", "territory-19", "territory-34", "territory-35", "territory-36"],
    cells: [
      { sector: "sector-1", at: { x: 401, y: 822.8 }, areaShare: 0.363, room: 32 },
      { sector: "sector-2", at: { x: 480.86, y: 831.65 }, areaShare: 0.458, room: 40 },
      { sector: "sector-3", at: { x: 557.75, y: 825.57 }, areaShare: 0.179, room: 23.7 }
    ]
  },
  {
    id: "territory-19",
    displayName: "Cielago West",
    sectors: ["sector-1", "sector-18"],
    centroid: { x: 334.88, y: 786.85 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-08", "territory-09", "territory-10", "territory-18", "territory-36", "territory-37"],
    cells: [
      { sector: "sector-1", at: { x: 346.23, y: 823.25 }, areaShare: 0.287, room: 11.8 },
      { sector: "sector-18", at: { x: 335.27, y: 757.5 }, areaShare: 0.713, room: 21.5 }
    ]
  },
  {
    id: "territory-20",
    displayName: "Habbanya Erg",
    sectors: ["sector-16", "sector-17"],
    centroid: { x: 229.95, y: 655 },
    terrain: "sand",
    spiceSector: "sector-16",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-10", "territory-21", "territory-37"],
    cells: [
      { sector: "sector-16", at: { x: 144.1, y: 652.52 }, areaShare: 0.736, room: 21.8 },
      { sector: "sector-17", at: { x: 231.84, y: 667.31 }, areaShare: 0.264, room: 25.1 }
    ]
  },
  {
    id: "territory-21",
    displayName: "The Greater Flat",
    sectors: ["sector-16"],
    centroid: { x: 135.57, y: 594.62 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-10", "territory-20", "territory-22"],
    cells: [
      { sector: "sector-16", at: { x: 180.4, y: 590.68 }, areaShare: 1, room: 31.7 }
    ]
  },
  {
    id: "territory-22",
    displayName: "The Great Flat",
    sectors: ["sector-15", "sector-16"],
    centroid: { x: 91.16, y: 529.3 },
    terrain: "sand",
    spiceSector: "sector-15",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-21", "territory-23", "territory-24"],
    cells: [
      { sector: "sector-15", at: { x: 206.25, y: 529.65 }, areaShare: 0.979, room: 25.8 },
      { sector: "sector-16", at: { x: 202.03, y: 557.74 }, areaShare: 0.021, room: 1.2 }
    ]
  },
  {
    id: "territory-23",
    displayName: "Funeral Plain",
    sectors: ["sector-15"],
    centroid: { x: 132.37, y: 475.96 },
    terrain: "sand",
    spiceSector: "sector-15",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-22", "territory-24", "territory-39"],
    cells: [
      { sector: "sector-15", at: { x: 166.59, y: 481.28 }, areaShare: 1, room: 17.6 }
    ]
  },
  {
    id: "territory-24",
    displayName: "Plastic Basin",
    sectors: ["sector-12", "sector-13", "sector-14"],
    centroid: { x: 254.02, y: 335.88 },
    terrain: "rock",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-11", "territory-22", "territory-23", "territory-25", "territory-39", "territory-40", "territory-41", "territory-42"],
    cells: [
      { sector: "sector-12", at: { x: 334.31, y: 229.28 }, areaShare: 0.125, room: 20.8 },
      { sector: "sector-13", at: { x: 269.52, y: 301.54 }, areaShare: 0.394, room: 41.1 },
      { sector: "sector-14", at: { x: 281.81, y: 434.87 }, areaShare: 0.475, room: 39.2 }
    ]
  },
  {
    id: "territory-25",
    displayName: "Tsimpo",
    sectors: ["sector-11", "sector-12", "sector-13"],
    centroid: { x: 444.17, y: 207.66 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-05", "territory-11", "territory-24", "territory-26", "territory-27", "territory-42"],
    cells: [
      { sector: "sector-11", at: { x: 478.01, y: 199.14 }, areaShare: 0.492, room: 30.5 },
      { sector: "sector-12", at: { x: 387.29, y: 246.69 }, areaShare: 0.444, room: 24 },
      { sector: "sector-13", at: { x: 322.97, y: 314.04 }, areaShare: 0.064, room: 12.6 }
    ]
  },
  {
    id: "territory-26",
    displayName: "Carthag",
    sectors: ["sector-11"],
    centroid: { x: 474.57, y: 278.95 },
    terrain: "stronghold",
    spiceSector: null,
    stronghold: true,
    spiceBlow: null,
    spiceIncome: 2,
    ornithopters: true,
    adjacent: ["territory-05", "territory-11", "territory-12", "territory-25"],
    cells: [
      { sector: "sector-11", at: { x: 474.73, y: 279.87 }, areaShare: 0.987, room: 39.8 }
    ]
  },
  {
    id: "territory-27",
    displayName: "Old Gap",
    sectors: ["sector-9", "sector-10", "sector-11"],
    centroid: { x: 685.83, y: 205.96 },
    terrain: "sand",
    spiceSector: "sector-10",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-05", "territory-13", "territory-14", "territory-25", "territory-28", "territory-42"],
    cells: [
      { sector: "sector-9", at: { x: 697.74, y: 213.08 }, areaShare: 0.153, room: 13.5 },
      { sector: "sector-10", at: { x: 627.68, y: 175.53 }, areaShare: 0.722, room: 16.7 },
      { sector: "sector-11", at: { x: 540.28, y: 144.55 }, areaShare: 0.125, room: 15 }
    ]
  },
  {
    id: "territory-28",
    displayName: "Basin",
    sectors: ["sector-9"],
    centroid: { x: 726.58, y: 242.41 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-14", "territory-15", "territory-27", "territory-29"],
    cells: [
      { sector: "sector-9", at: { x: 719.39, y: 248.7 }, areaShare: 1, room: 26.7 }
    ]
  },
  {
    id: "territory-29",
    displayName: "Sihaya Ridge",
    sectors: ["sector-9"],
    centroid: { x: 772.48, y: 273.39 },
    terrain: "sand",
    spiceSector: "sector-9",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-06", "territory-15", "territory-28", "territory-30"],
    cells: [
      { sector: "sector-9", at: { x: 773.5, y: 275.15 }, areaShare: 1, room: 25.6 }
    ]
  },
  {
    id: "territory-30",
    displayName: "Gara Kulon",
    sectors: ["sector-8"],
    centroid: { x: 813.4, y: 341.3 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-06", "territory-16", "territory-29"],
    cells: [
      { sector: "sector-8", at: { x: 812.44, y: 343.5 }, areaShare: 0.994, room: 36 }
    ]
  },
  {
    id: "territory-31",
    displayName: "Red Chasm",
    sectors: ["sector-7"],
    centroid: { x: 882.35, y: 510.35 },
    terrain: "sand",
    spiceSector: "sector-7",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-16", "territory-32"],
    cells: [
      { sector: "sector-7", at: { x: 886.36, y: 505.64 }, areaShare: 1, room: 26 }
    ]
  },
  {
    id: "territory-32",
    displayName: "South Mesa",
    sectors: ["sector-4", "sector-5", "sector-6"],
    centroid: { x: 891.73, y: 582.81 },
    terrain: "sand",
    spiceSector: "sector-5",
    stronghold: false,
    spiceBlow: 10,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-16", "territory-17", "territory-31", "territory-33", "territory-34"],
    cells: [
      { sector: "sector-4", at: { x: 770.71, y: 853.84 }, areaShare: 0.234, room: 16.8 },
      { sector: "sector-5", at: { x: 840.09, y: 763.81 }, areaShare: 0.349, room: 9.3 },
      { sector: "sector-6", at: { x: 886.55, y: 630.6 }, areaShare: 0.404, room: 15.3 }
    ]
  },
  {
    id: "territory-33",
    displayName: "Tuek's Sietch",
    sectors: ["sector-5"],
    centroid: { x: 800.65, y: 727.55 },
    terrain: "stronghold",
    spiceSector: null,
    stronghold: true,
    spiceBlow: null,
    spiceIncome: 1,
    ornithopters: false,
    adjacent: ["territory-16", "territory-17", "territory-32"],
    cells: [
      { sector: "sector-5", at: { x: 797.13, y: 736.04 }, areaShare: 1, room: 35 }
    ]
  },
  {
    id: "territory-34",
    displayName: "Cielago East",
    sectors: ["sector-3", "sector-4"],
    centroid: { x: 653.11, y: 893.16 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-08", "territory-17", "territory-18", "territory-32", "territory-35"],
    cells: [
      { sector: "sector-3", at: { x: 622.83, y: 871.97 }, areaShare: 0.704, room: 30.2 },
      { sector: "sector-4", at: { x: 679.97, y: 858.54 }, areaShare: 0.296, room: 15.9 }
    ]
  },
  {
    id: "territory-35",
    displayName: "Cielago South",
    sectors: ["sector-2", "sector-3"],
    centroid: { x: 528.07, y: 925.53 },
    terrain: "sand",
    spiceSector: "sector-2",
    stronghold: false,
    spiceBlow: 12,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-18", "territory-34", "territory-36"],
    cells: [
      { sector: "sector-2", at: { x: 500.05, y: 930.67 }, areaShare: 0.677, room: 47.8 },
      { sector: "sector-3", at: { x: 570.51, y: 913.04 }, areaShare: 0.323, room: 27.7 }
    ]
  },
  {
    id: "territory-36",
    displayName: "Meridian",
    sectors: ["sector-1", "sector-2"],
    centroid: { x: 386.16, y: 919.65 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-18", "territory-19", "territory-35", "territory-37"],
    cells: [
      { sector: "sector-1", at: { x: 358.21, y: 916.57 }, areaShare: 0.799, room: 51.4 },
      { sector: "sector-2", at: { x: 433.83, y: 934.76 }, areaShare: 0.2, room: 16.7 }
    ]
  },
  {
    id: "territory-37",
    displayName: "Habbanya Ridge Flat",
    sectors: ["sector-17", "sector-18"],
    centroid: { x: 178.9, y: 752.99 },
    terrain: "sand",
    spiceSector: "sector-18",
    stronghold: false,
    spiceBlow: 10,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-10", "territory-19", "territory-20", "territory-36", "territory-38"],
    cells: [
      { sector: "sector-17", at: { x: 168.39, y: 742.75 }, areaShare: 0.549, room: 64.4 },
      { sector: "sector-18", at: { x: 238.64, y: 846.65 }, areaShare: 0.451, room: 44 }
    ]
  },
  {
    id: "territory-38",
    displayName: "Habbanya Sietch",
    sectors: ["sector-17"],
    centroid: { x: 184.55, y: 753.92 },
    terrain: "stronghold",
    spiceSector: null,
    stronghold: true,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-37"],
    cells: [
      { sector: "sector-17", at: { x: 185.96, y: 751.89 }, areaShare: 0.983, room: 30.8 }
    ]
  },
  {
    id: "territory-39",
    displayName: "Bight Of The Cliff",
    sectors: ["sector-14", "sector-15"],
    centroid: { x: 106.36, y: 422.17 },
    terrain: "sand",
    spiceSector: null,
    stronghold: false,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-23", "territory-24", "territory-40", "territory-41"],
    cells: [
      { sector: "sector-14", at: { x: 130.73, y: 402.16 }, areaShare: 0.626, room: 1.1 },
      { sector: "sector-15", at: { x: 119.3, y: 439.94 }, areaShare: 0.374, room: 11.5 }
    ]
  },
  {
    id: "territory-40",
    displayName: "Sietch Tabr",
    sectors: ["sector-14"],
    centroid: { x: 172.86, y: 374.57 },
    terrain: "stronghold",
    spiceSector: null,
    stronghold: true,
    spiceBlow: null,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-24", "territory-39", "territory-41"],
    cells: [
      { sector: "sector-14", at: { x: 173.63, y: 375.16 }, areaShare: 1, room: 34.2 }
    ]
  },
  {
    id: "territory-41",
    displayName: "Rock Outcroppings",
    sectors: ["sector-13", "sector-14"],
    centroid: { x: 185.01, y: 288.28 },
    terrain: "sand",
    spiceSector: "sector-14",
    stronghold: false,
    spiceBlow: 6,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-24", "territory-39", "territory-40", "territory-42"],
    cells: [
      { sector: "sector-13", at: { x: 212.7, y: 251.91 }, areaShare: 0.681, room: 17.1 },
      { sector: "sector-14", at: { x: 152.5, y: 316.09 }, areaShare: 0.319, room: 19 }
    ]
  },
  {
    id: "territory-42",
    displayName: "Broken Land",
    sectors: ["sector-11", "sector-12"],
    centroid: { x: 326.32, y: 182.36 },
    terrain: "sand",
    spiceSector: "sector-12",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-24", "territory-25", "territory-27", "territory-41"],
    cells: [
      { sector: "sector-11", at: { x: 464.8, y: 147.13 }, areaShare: 0.402, room: 20.7 },
      { sector: "sector-12", at: { x: 348.02, y: 173.02 }, areaShare: 0.598, room: 21.3 }
    ]
  }
];

// src/lib/dune/phase.ts
var awaiting = (from, ask, carry) => ({ status: "awaiting", need: "required", from, ask, carry });
var awaitingBy = (from, ask, carry, closesAt) => ({ status: "awaiting", need: "required", from, ask, carry, closesAt });
var settled = (result) => ({ status: "settled", result });
function isAwaiting(step) {
  return step.status === "awaiting";
}
function runToSettled(first, answer, limit = 10) {
  let step = first;
  for (let i = 0; i < limit; i++) {
    if (!isAwaiting(step)) return step.result;
    step = answer(step.carry, step.ask);
  }
  throw new Error(
    `phase still awaiting after ${limit} answers \u2014 a resume function is most likely returning the same pause it was given`
  );
}

// src/lib/dune/spiceBlow.ts
var SHAI_HULUD_COUNT = 6;
var WORM_SECONDS = 60;
function buildSpiceDeck() {
  const territories = DUNE_TERRITORIES.flatMap((t) => t.spiceBlow != null && t.spiceSector != null ? [{
    kind: "territory",
    territoryId: t.id,
    name: t.displayName,
    spice: t.spiceBlow,
    sector: t.spiceSector
  }] : []);
  return [...territories, ...Array.from({ length: SHAI_HULUD_COUNT }, () => ({ kind: "shai-hulud" }))];
}
function shuffle(cards, rng) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function showing(discard) {
  return discard.length ? discard[discard.length - 1] : null;
}
function publicSpiceDeck(input) {
  return {
    remaining: input.deck.length,
    discardA: [...input.discardA],
    discardB: [...input.discardB ?? []]
  };
}
function devourTerritory(territoryId, forces, spiceOnBoard) {
  const inTerritory = forces.filter((f) => f.territoryId === territoryId);
  return {
    territoryId,
    // Shai-Hulud does not devour the Fremen. Both games.
    forcesKilled: inTerritory.filter((f) => f.faction !== "fremen"),
    forcesSpared: inTerritory.filter((f) => f.faction === "fremen"),
    spiceRemoved: spiceOnBoard[territoryId] ?? 0
  };
}
function applySpicePlacement(spiceOnBoard, placed) {
  if (!placed) return { ...spiceOnBoard };
  return { ...spiceOnBoard, [placed.territoryId]: placed.amount };
}
function applyBlowToBoard(spiceOnBoard, out) {
  const next = { ...spiceOnBoard };
  for (const d of out.devoured) delete next[d.territoryId];
  return applySpicePlacement(next, out.placed);
}
function resolveSpiceBlow(input) {
  const deck = [...input.deck];
  const discard = [...input.discard];
  const devoured = [];
  let wormsSeen = 0;
  let wormsToPlace = 0;
  let nexus = false;
  let reshuffled = false;
  let blockedByStorm = null;
  const setAside = [];
  let placed = null;
  while (true) {
    if (deck.length === 0) {
      if (input.mode !== "advanced") {
        throw new Error("spice deck exhausted \u2014 it cannot run dry in ten turns of the basic game, so this is a bug, not a rule");
      }
      const buried = discard.slice(0, -1);
      if (buried.length === 0) {
        throw new Error("spice deck exhausted with nothing buried to reshuffle");
      }
      deck.push(...shuffle(buried, input.rng));
      discard.splice(0, discard.length - 1);
      reshuffled = true;
    }
    const card = deck.shift();
    if (card.kind === "territory") {
      const landing = { territoryId: card.territoryId, sector: card.sector, amount: card.spice };
      if (card.sector === input.storm) blockedByStorm = landing;
      else placed = landing;
      discard.push(card);
      break;
    }
    if (input.firstTurn) {
      setAside.push(card);
      continue;
    }
    wormsSeen++;
    if (!input.nexusAlreadyTriggered && !nexus) nexus = true;
    const top = showing(discard);
    if (!top) {
      throw new Error("Shai-Hulud drawn with an empty discard \u2014 turn 1 must place a territory card first");
    }
    const fremenPlacesIt = input.mode === "advanced" && input.fremenInPlay && wormsSeen > 1;
    if (fremenPlacesIt) {
      wormsToPlace++;
      discard.push(card);
      continue;
    }
    if (top.kind === "territory") {
      devoured.push(devourTerritory(top.territoryId, input.forces, input.spiceOnBoard));
    }
    discard.push(card);
  }
  const finalDeck = setAside.length && !input.deferSetAside ? shuffle([...deck, ...setAside], input.rng) : deck;
  return {
    deck: finalDeck,
    discard,
    placed,
    devoured,
    ignored: setAside.length,
    setAside,
    blockedByStorm,
    nexus,
    reshuffled,
    toTanks: devoured.flatMap((d) => d.forcesKilled),
    wormsForFremenToPlace: wormsToPlace
  };
}
function owed(carry) {
  const from = carry.pile === "A" ? carry.a : carry.b;
  return from?.wormsForFremenToPlace ?? 0;
}
function pauseOrContinue(carry, rng, closesAt) {
  if (carry.fremenInPlay && owed(carry) > 0) {
    const ask = { kind: "place-worms", pile: carry.pile, worms: owed(carry) };
    return closesAt == null ? awaiting(["fremen"], ask, carry) : awaitingBy(["fremen"], ask, carry, closesAt);
  }
  return carry.pile === "A" ? revealPileB(carry, rng, closesAt) : finish(carry, rng);
}
function revealPileB(carry, rng, closesAt) {
  const b = resolveSpiceBlow({
    deck: carry.deck,
    discard: carry.discardB,
    forces: carry.forces,
    mode: "advanced",
    fremenInPlay: carry.fremenInPlay,
    spiceOnBoard: carry.spiceOnBoard,
    storm: carry.storm,
    firstTurn: carry.firstTurn,
    nexusAlreadyTriggered: carry.a.nexus,
    deferSetAside: true,
    rng
  });
  return pauseOrContinue({
    ...carry,
    pile: "B",
    b,
    deck: b.deck,
    discardB: b.discard,
    forces: carry.forces.filter((f) => !b.toTanks.includes(f)),
    spiceOnBoard: applyBlowToBoard(carry.spiceOnBoard, b)
  }, rng, closesAt);
}
function finish(carry, rng) {
  const { a, b } = carry;
  if (!b) throw new Error("the spice blow finished without ever revealing pile B");
  const held = [...a.setAside, ...b.setAside];
  return settled({
    deck: held.length ? shuffle([...carry.deck, ...held], rng) : carry.deck,
    discardA: carry.discardA,
    discardB: carry.discardB,
    // Already filtered, pile by pile and worm by worm, as the phase went.
    forces: carry.forces,
    a,
    b,
    nexus: a.nexus || b.nexus,
    reshuffled: a.reshuffled || b.reshuffled,
    blockedByStorm: [a.blockedByStorm, b.blockedByStorm].filter((x) => x != null),
    ignored: a.ignored + b.ignored,
    wormsForFremenToPlace: a.wormsForFremenToPlace + b.wormsForFremenToPlace,
    devouredByFremen: carry.devouredByFremen,
    spiceOnBoard: carry.spiceOnBoard,
    toTanks: [
      ...a.toTanks,
      ...b.toTanks,
      ...carry.devouredByFremen.flatMap((d) => d.forcesKilled)
    ]
  });
}
function beginDoubleSpiceBlow(input) {
  const a = resolveSpiceBlow({
    deck: input.deck,
    discard: input.discardA,
    forces: input.forces,
    mode: "advanced",
    fremenInPlay: input.fremenInPlay,
    spiceOnBoard: input.spiceOnBoard,
    storm: input.storm,
    firstTurn: input.firstTurn,
    deferSetAside: true,
    rng: input.rng
  });
  return pauseOrContinue({
    pile: "A",
    deck: a.deck,
    discardA: a.discard,
    discardB: [...input.discardB],
    forces: input.forces.filter((f) => !a.toTanks.includes(f)),
    spiceOnBoard: applyBlowToBoard(input.spiceOnBoard, a),
    firstTurn: input.firstTurn,
    fremenInPlay: input.fremenInPlay ?? false,
    storm: input.storm,
    a,
    b: null,
    devouredByFremen: []
  }, input.rng, input.closesAt);
}
function placeFremenWorms(carry, at, rng, closesAt) {
  if (at.length > owed(carry)) {
    throw new Error(
      `the Fremen were offered ${owed(carry)} worm(s) from pile ${carry.pile} but tried to place ${at.length}`
    );
  }
  for (const id of at) {
    if (!DUNE_TERRITORIES.some((t) => t.id === id)) {
      throw new Error(`no such territory to place a worm in: ${id}`);
    }
  }
  const devoured = at.map((id) => devourTerritory(id, carry.forces, carry.spiceOnBoard));
  const killed = devoured.flatMap((d) => d.forcesKilled);
  const spiceOnBoard = { ...carry.spiceOnBoard };
  for (const d of devoured) delete spiceOnBoard[d.territoryId];
  const next = {
    ...carry,
    forces: carry.forces.filter((f) => !killed.includes(f)),
    spiceOnBoard,
    devouredByFremen: [...carry.devouredByFremen, ...devoured]
  };
  return next.pile === "A" ? revealPileB(next, rng, closesAt) : finish(next, rng);
}
function resolveDoubleSpiceBlow(input) {
  return runToSettled(
    beginDoubleSpiceBlow(input),
    (carry) => placeFremenWorms(carry, [], input.rng)
  );
}
export {
  SHAI_HULUD_COUNT,
  WORM_SECONDS,
  applyBlowToBoard,
  applySpicePlacement,
  beginDoubleSpiceBlow,
  buildSpiceDeck,
  devourTerritory,
  placeFremenWorms,
  publicSpiceDeck,
  resolveDoubleSpiceBlow,
  resolveSpiceBlow,
  showing,
  shuffle
};
