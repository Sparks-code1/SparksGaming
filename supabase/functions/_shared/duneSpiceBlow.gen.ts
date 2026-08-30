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
    outline: "M537.097 512.456L524.597 511.456L522.597 501.456L539.097 488.456L548.597 470.956L570.097 484.956L577.597 494.956L595.597 518.456V557.956L589.097 561.956L592.097 575.956L579.597 604.456L554.097 615.956L527.597 596.456L537.097 577.456L550.597 556.956L554.097 530.956L537.097 512.456Z",
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
    outline: "M521.597 604.956L527.597 596.456L554.097 615.956L579.597 604.456L599.597 614.456L591.097 645.956L574.097 645.456L563.597 641.956V661.456L555.76 682.956L519.597 619.456L521.597 604.956Z",
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
    outline: "M437.097 519.456L460.097 514.956L483.097 505.956L494.597 504.956L501.097 515.456L516.097 514.956L524.597 511.456L537.097 512.456L554.097 530.956L550.597 556.956L537.097 577.456L527.597 596.456L521.597 604.956L519.597 619.456L500.597 634.956L471.597 636.456L451.81 611.638L440.597 613.456L426.597 607.956L415.097 596.956L406.597 596.456L400.314 587.956L398.097 584.956L403.597 559.456L417.597 534.956L437.097 519.456Z",
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
    outline: "M348.596 558.956L343.096 576.956L343.596 608.456L327.354 689.956L361.096 660.456L384.596 593.956L400.314 587.956L398.096 584.956L403.596 559.456L417.596 534.956L437.096 519.456L402.596 490.956L375.096 518.456L371.596 538.956L348.596 558.956Z",
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
    outline: "M574.097 178.456L553.597 162.456L531.597 190.956L515.097 228.956L506.097 236.956L515.097 251.456V287.456L496.597 327.456L489.597 371.456L493.597 387.456L492.597 420.456L498.097 427.456L495.097 465.456L499.097 474.456L494.597 504.956L501.097 515.456L516.097 514.956L524.597 511.456L522.597 501.456L539.097 488.456L548.597 470.956L579.597 437.956L573.597 430.956L592.097 397.956L600.597 396.956L617.597 350.956L615.097 345.956L619.597 341.456L617.097 328.456L628.597 308.871L616.097 305.456L606.097 308.456L596.597 291.456L572.597 274.456L571.097 257.956L584.597 244.956L596.097 218.956L590.097 197.956L592.597 191.456L584.097 178.456H574.097Z",
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
    outline: "M758.097 297.456L732.597 300.456L712.597 326.956V337.956L682.597 358.456L670.597 360.956L609.097 395.956L600.597 396.956L592.097 397.956L573.597 430.956L579.597 437.956L548.597 470.956L570.097 484.956L577.597 494.956L599.097 484.956L604.597 475.956L629.597 467.956L640.097 470.956L646.597 456.456L654.097 453.956L658.097 443.956L671.347 439.206L684.597 434.456L689.597 428.456L689.097 421.956L700.597 418.456L710.597 407.456L721.597 381.456L753.597 355.456L769.597 342.956L785.097 313.956V304.956L758.097 297.456Z",
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
    outline: "M599.097 484.956L577.597 494.956L595.597 518.456V557.956L589.097 561.956L592.097 575.956L579.597 604.456L599.597 614.456L607.597 613.456L620.597 625.456L629.097 659.456L640.597 675.956L649.097 675.456L661.097 648.956L655.097 617.456L678.597 559.456L685.097 528.456L682.097 486.956L671.097 466.956L671.347 439.206L658.097 443.956L654.097 453.956L646.597 456.456L640.097 470.956L629.597 467.956L604.597 475.956L599.097 484.956Z",
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
    outline: "M571.597 760.955L583.097 730.956L555.76 682.956L519.597 619.455L500.597 634.955L471.597 636.455L451.81 611.638L381.718 734.456L372.597 749.955L376.097 762.955L384.097 769.455L395.097 780.955L454.597 788.955L460.097 782.455L483.097 781.955L528.597 811.955L543.097 803.455L562.097 774.455L571.597 760.955Z",
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
    outline: "M440.597 613.456L451.536 611.821L381.718 734.456L363.097 696.456L361.097 660.456L384.597 593.956L400.314 587.956L406.597 596.456L415.097 596.956L426.597 607.956L440.597 613.456Z",
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
    outline: "M285.097 823.956L298.597 824.956L296.597 769.956L315.597 748.956L327.355 689.956L343.597 608.456L343.097 576.956L310.597 580.456L307.097 591.956L287.097 600.956L286.597 606.456L282.097 607.956V632.956L282.597 650.456L255.597 680.456L247.597 699.956L257.097 713.956L256.097 726.456L249.097 732.456L250.597 755.956L265.597 786.456L268.597 814.456L285.097 823.956Z",
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
    outline: "M317.597 418.956L402.597 490.956L437.097 519.456L460.097 514.956C454.763 505.789 444.097 487.056 444.097 485.456C444.097 483.856 444.763 471.456 445.097 465.456L441.597 456.456L435.597 446.956L436.597 386.456L449.097 360.956L440.597 316.706L432.097 272.456L405.097 284.956L399.097 280.956L371.597 285.456L341.097 309.456L330.597 329.956L314.597 335.956L307.097 330.956L305.097 361.456L300.597 368.456L308.597 399.956L316.597 406.456L317.597 418.956Z",
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
    outline: "M436.597 386.456L449.097 360.956L440.597 316.706C442.597 317.122 446.897 318.056 448.097 318.456C449.297 318.856 456.597 326.289 460.097 329.956L470.597 326.456L496.597 327.456L489.597 371.456L493.597 387.456L492.597 420.456L498.097 427.456L495.097 465.456L499.097 474.456L494.597 504.956L483.097 505.956L460.097 514.956C454.763 505.789 444.097 487.056 444.097 485.456C444.097 483.856 444.763 471.456 445.097 465.456L441.597 456.456L435.597 446.956L436.597 386.456Z",
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
    outline: "M622.597 191.456H592.597L590.097 197.956L596.097 218.956L584.597 244.956L571.097 257.956L572.597 274.456L596.597 291.456L606.097 308.456L616.097 305.456L628.597 308.871L667.597 242.456L666.097 224.456L645.597 198.956L622.597 191.456Z",
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
    outline: "M675.097 242.456H667.597L628.597 308.871L617.097 328.456L619.597 341.456L615.097 345.956L617.597 350.956L638.597 335.956L638.097 329.956L652.597 321.956L653.097 315.956L659.097 316.456L660.597 307.456L669.097 293.456L675.097 282.456L678.597 263.956L687.097 254.456L685.097 237.956L680.597 234.956L675.097 242.456Z",
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
    outline: "M678.597 295.956L669.097 293.456L660.597 307.456L659.097 316.456L653.097 315.956L652.597 321.956L638.097 329.956L638.597 335.956L617.597 350.956L600.597 396.956L609.097 395.956L670.597 360.956L682.597 358.456L712.597 337.956V326.956L732.597 300.456L741.597 288.456L740.597 274.956H725.112L704.597 285.956L694.597 287.456L678.597 295.956Z",
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
    outline: "M757.597 371.956L753.597 355.456L721.597 381.456L710.597 407.456L700.597 418.456L689.097 421.956L689.597 428.456L684.597 434.456L671.347 439.206L671.097 466.956L682.097 486.956L685.097 528.456L678.597 559.456L655.097 617.456L661.097 648.956L683.597 669.956L696.097 667.956L721.597 683.456L732.097 682.456L759.597 701.456L775.097 675.956L812.097 683.456L821.597 693.956L845.597 699.956L871.097 639.456L871.597 612.956L868.097 602.956L871.597 598.956L866.097 588.956L870.597 572.456L881.097 557.456L881.597 544.956H869.097L854.097 523.956L849.097 501.456L857.097 483.456L873.097 471.956L873.597 463.956L898.732 437.456C892.256 414.984 884.007 393.263 874.145 372.456H861.597L856.097 377.956L849.597 373.456L833.097 385.456L821.097 378.456L795.097 386.956L786.097 376.456L764.097 376.956L757.597 371.956Z",
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
    outline: "M771.097 815.956L790.597 802.956L765.097 792.456L760.097 776.956L764.597 754.456L759.597 722.456V701.456L732.097 682.456L721.597 683.456L696.097 667.956L683.597 669.956L661.097 648.956L649.097 675.456L640.597 675.956L629.097 659.456L620.597 625.456L607.597 613.456L599.597 614.456L591.097 645.956L574.097 645.456L563.597 641.956V661.456L555.76 682.956L583.097 730.956L620.097 776.956L651.597 806.456L674.097 816.456L691.097 835.456L695.597 855.456L704.597 869.456L723.597 872.956L735.597 870.456L754.597 848.956C755.763 842.956 758.097 830.656 758.097 829.456C758.097 828.256 766.763 819.956 771.097 815.956Z",
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
    outline: "M567.597 799.456L562.097 774.456L543.097 803.456L528.597 811.956L483.097 781.956L460.097 782.456L454.597 788.956L395.097 780.956L384.097 769.456L371.097 776.456L375.097 786.956L370.097 814.456L356.597 828.956L355.097 850.956L371.597 860.456L391.597 858.456L421.597 872.456L457.597 873.456L479.097 872.956L517.597 864.456L537.097 862.956L563.597 851.456L583.597 849.956L591.597 830.956L567.597 799.456Z",
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
    outline: "M331.097 872.956L355.097 850.956L356.597 828.956L370.097 814.456L375.097 786.956L371.097 776.456L384.097 769.456L376.097 762.956L372.597 749.956L381.718 734.456L363.097 696.456L361.097 660.456L327.355 689.956L315.597 748.956L296.597 769.956L298.597 824.956L308.597 837.956L302.097 875.456L331.097 872.956Z",
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
    outline: "M228.597 694.456L247.597 699.956L255.597 680.456L282.597 650.456L282.097 632.956L263.097 622.456H243.097L228.597 617.956L207.597 622.456L173.597 623.456L140.597 630.956L99.5967 629.956L67.5967 623.956L56.0708 626.456C60.5292 654.264 67.6386 681.186 77.1315 706.956L171.097 673.456L180.597 673.956L190.097 674.456L201.597 685.456H213.097L228.597 694.456Z",
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
    outline: "M50.5967 557.456C50.5967 557.956 50.5975 558.456 50.5992 558.956M50.5992 558.956C50.6772 581.921 52.5451 604.465 56.0708 626.456L67.5967 623.956L99.5967 629.956L140.597 630.956L173.597 623.456L207.597 622.456L228.597 617.956L243.097 622.456H263.097L282.097 632.956V607.956L286.597 606.456L287.097 600.956L307.097 591.956L310.597 580.456L343.097 576.956L348.597 558.956H50.5992Z",
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
    outline: "M50.5967 557.456C50.5967 557.956 50.5975 558.456 50.5992 558.956H348.597L371.597 538.956L375.097 518.456L312.097 495.402L311.597 503.956L278.097 508.956L267.097 501.456L233.597 497.956C216.763 501.289 182.797 507.956 181.597 507.956C180.397 507.956 161.763 508.956 152.597 509.456L124.597 500.956L75.5967 498.956L56.4791 485.956C52.6099 509.214 50.5967 533.1 50.5967 557.456Z",
    sectors: ["sector-15"],
    centroid: { x: 91.16, y: 529.3 },
    terrain: "sand",
    spiceSector: "sector-15",
    stronghold: false,
    spiceBlow: 8,
    spiceIncome: null,
    ornithopters: false,
    adjacent: ["territory-04", "territory-21", "territory-23", "territory-24"],
    cells: [
      { sector: "sector-15", at: { x: 206.25, y: 529.65 }, areaShare: 0.979, room: 25.8 }
    ]
  },
  {
    id: "territory-23",
    displayName: "Funeral Plain",
    outline: "M183.097 461.956L196.097 452.956L312.097 495.402L311.597 503.956L278.097 508.956L267.097 501.456L233.597 497.956C216.763 501.289 182.797 507.956 181.597 507.956C180.397 507.956 161.763 508.956 152.597 509.456L124.597 500.956L75.5965 498.956L56.479 485.956C58.7056 472.571 61.5469 459.394 64.9728 446.456L79.5965 447.456L88.0965 457.456L107.597 455.456L134.097 447.456L153.597 457.456L158.097 464.456L183.097 461.956Z",
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
    outline: "M297.597 208.456L278.597 201.456L262.097 221.956L244.097 231.956L230.597 251.956L226.097 265.956L211.097 306.456L194.097 324.956L197.597 342.456L208.097 360.956L207.597 370.956L213.597 373.956L211.097 382.956L219.097 388.456L211.097 418.456L206.597 435.456H200.597L196.097 443.956V452.956L312.097 495.402L375.097 518.456L402.597 490.956L317.597 418.956L316.597 406.456L308.597 399.956L300.597 368.456L305.097 361.456L307.097 330.956L304.597 323.456L314.097 303.456L326.597 287.956L329.597 271.456L339.097 266.456L347.597 256.456L353.097 252.956L355.597 244.956L362.597 243.956L373.597 215.956L379.597 214.956L380.097 190.456L354.097 193.456L336.097 208.456H297.597Z",
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
    outline: "M417.097 175.956L380.097 190.456L379.597 214.956L373.597 215.956L362.597 243.956L355.597 244.956L353.097 252.956L347.597 256.456L339.097 266.456L329.597 271.456L326.597 287.956L314.097 303.456L304.597 323.456L307.097 330.956L314.597 335.956L330.597 329.956L341.097 309.456L371.597 285.456L399.097 280.956L405.097 284.956L432.097 272.456L430.597 249.456L465.597 239.456L477.097 232.956L506.097 236.956L515.097 228.956L531.597 190.956L553.597 162.456L528.097 157.456H515.597L502.097 160.456L491.597 169.456L458.597 167.456L417.097 175.956Z",
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
    outline: "M430.597 249.456L432.097 272.456L440.597 316.706C442.597 317.122 446.897 318.056 448.097 318.456C449.297 318.856 456.597 326.289 460.097 329.956L470.597 326.456L496.597 327.456L515.097 287.456V251.456L506.097 236.956L477.097 232.956L465.597 239.456L430.597 249.456Z",
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
    outline: "M523.597 143.956L515.597 157.456H528.097L553.597 162.456L574.097 178.456H584.097L592.597 191.456H622.597L645.597 198.956L666.097 224.456L667.597 242.456H675.097L680.597 234.956L685.097 237.956L704.597 226.456L725.112 198.956C666.961 159.621 598.727 134.064 525.097 126.969L523.597 143.956Z",
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
    outline: "M704.597 226.456L685.097 237.956L687.097 254.456L678.597 263.956L675.097 282.456L669.097 293.456L678.597 295.956L694.597 287.456L704.597 285.956L725.112 274.956H740.597L748.097 258.956L773.097 236.583C758.028 222.956 741.995 210.375 725.112 198.956L704.597 226.456Z",
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
    outline: "M748.097 258.956L740.597 274.956L741.597 288.456L732.597 300.456L758.097 297.456L785.097 304.956L815.266 280.456C802.249 264.863 788.154 250.2 773.097 236.583L748.097 258.956Z",
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
    outline: "M815.266 280.456L785.097 304.956V313.956L769.597 342.956L753.597 355.456L757.597 371.956L764.097 376.956L786.097 376.456L795.097 386.956L821.097 378.456L833.097 385.456L849.597 373.456L856.097 377.956L861.597 372.456H874.145C858.406 339.246 838.561 308.36 815.266 280.456Z",
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
    outline: "M915.597 557.456C915.597 515.819 909.713 475.557 898.732 437.456L873.597 463.956L873.097 471.956L857.097 483.456L849.097 501.456L854.097 523.956L869.097 544.956H881.597L881.097 557.456H915.597Z",
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
    outline: "M915.597 557.456H881.097L870.597 572.456L866.097 588.956L871.597 598.956L868.097 602.956L871.597 612.956L871.097 639.456L845.597 699.956L840.097 720.456L841.097 743.456L824.097 772.956L790.597 802.956L771.097 815.956C766.763 819.956 758.097 828.256 758.097 829.456C758.097 830.656 755.763 842.956 754.597 848.956L735.597 870.456L736.097 908.276C844.835 829.72 915.597 701.851 915.597 557.456Z",
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
    outline: "M840.097 720.456L845.597 699.956L821.597 693.956L812.097 683.456L775.097 675.956L759.597 701.456V722.456L764.597 754.456L760.097 776.956L765.097 792.456L790.597 802.956L824.097 772.956L841.097 743.456L840.097 720.456Z",
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
    outline: "M736.097 908.276L735.597 870.456L723.597 872.956L704.597 869.456L695.597 855.456L691.097 835.456L674.097 816.456L651.597 806.456L620.097 776.956L583.097 730.956L571.597 760.956L562.097 774.456L567.597 799.456L591.597 830.956L583.597 849.956L585.097 866.956L596.597 886.956L598.597 917.956L593.097 934.456V966.456L598.097 974.5C648.351 960.673 694.944 938.006 736.097 908.276Z",
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
    outline: "M585.097 866.956L583.597 849.956L563.597 851.456L537.097 862.956L517.597 864.456L479.097 872.956L457.597 873.456L448.597 886.956L446.597 919.456L455.097 946.956L446.097 963.956L445.597 988.352C457.956 989.414 470.463 989.956 483.097 989.956C522.916 989.956 561.479 984.574 598.097 974.5L593.097 966.456V934.456L598.597 917.956L596.597 886.956L585.097 866.956Z",
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
    outline: "M448.597 886.956L457.597 873.456L421.597 872.456L391.597 858.456L371.597 860.456L355.097 850.956L331.097 872.956L302.097 875.456L268.097 932.815C321.205 963.3 381.397 982.839 445.597 988.352L446.097 963.956L455.097 946.956L446.597 919.456L448.597 886.956Z",
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
    outline: "M268.097 932.815L302.097 875.456L308.597 837.956L298.597 824.956L285.097 823.956L268.597 814.456L265.597 786.456L250.597 755.956L249.097 732.456L256.097 726.456L257.097 713.956L247.597 699.956L228.597 694.456L213.097 685.456H201.597L190.097 674.456L180.597 673.956L171.097 673.456L77.1318 706.956C112.423 802.757 180.658 882.623 268.097 932.815Z",
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
      { sector: "sector-17", at: { x: 117.06, y: 724.52 }, areaShare: 0.457, room: 29.9 },
      { sector: "sector-18", at: { x: 238.86, y: 847.03 }, areaShare: 0.543, room: 44.1 }
    ]
  },
  {
    id: "territory-38",
    displayName: "Habbanya Sietch",
    outline: "M155.597 713.956L146.097 732.456L154.097 769.456L189.097 807.956C203.263 796.456 231.597 772.956 231.597 770.956C231.597 768.956 217.93 745.456 211.097 733.956L210.097 724.456L204.597 709.956L179.597 703.956L155.597 713.956Z",
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
    outline: "M183.096 461.956L196.096 452.956V443.956L200.596 435.456H206.596L211.096 418.456L195.596 414.956L182.596 415.956L159.596 406.956L149.596 411.456L138.596 409.956L123.596 391.956L124.596 374.956L134.596 373.456L141.596 358.456L142.096 351.456L139.096 345.956L129.596 344.456L114.577 330.956C92.7503 366.392 75.8919 405.216 64.9727 446.456L79.5964 447.456L88.0964 457.456L107.596 455.456L134.096 447.456L153.596 457.456L158.096 464.456L183.096 461.956Z",
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
    outline: "M195.597 414.956L211.097 418.456L219.097 388.456L211.097 382.956L213.597 373.956L207.597 370.956L208.097 360.956L197.597 342.456L194.097 324.956L178.097 318.456L142.097 351.456L141.597 358.456L134.597 373.456L124.597 374.956L123.597 391.956L138.597 409.956L149.597 411.456L159.597 406.956L182.597 415.956L195.597 414.956Z",
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
    outline: "M278.597 201.456L268.097 182.096C205.336 218.122 152.47 269.435 114.577 330.956L129.597 344.456L139.097 345.956L142.097 351.456L178.097 318.456L194.097 324.956L211.097 306.456L226.097 265.956L230.597 251.956L244.097 231.956L262.097 221.956L278.597 201.456Z",
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
    outline: "M483.097 124.956C404.835 124.956 331.428 145.742 268.097 182.096L278.597 201.456L297.597 208.456H336.097L354.097 193.456L380.097 190.456L417.097 175.956L458.597 167.456L491.597 169.456L502.097 160.456L515.597 157.456L523.597 143.956L525.097 126.969C511.276 125.637 497.266 124.956 483.097 124.956Z",
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

// src/lib/dune/shipment.ts
var STRONGHOLD_CAP = 2;
var territory = (id) => DUNE_TERRITORIES.find((t) => t.id === id);
function settleSector(territoryId, sector) {
  const t = territory(territoryId);
  if (!t) return { ok: false, refusal: "no-such-territory" };
  if (t.sectors.length === 1) return { ok: true, sector: t.sectors[0] };
  if (!sector) return { ok: false, refusal: "sector-needed" };
  if (!t.sectors.includes(sector)) return { ok: false, refusal: "no-such-sector" };
  return { ok: true, sector };
}
function inStorm(territoryId, sector, storm) {
  const t = territory(territoryId);
  if (t?.terrain === "polar-sink") return false;
  return sector === storm;
}
function strongholdClosed(forces, faction, territoryId) {
  const t = territory(territoryId);
  if (!t?.stronghold) return false;
  const inside = new Set(
    forces.filter((f) => f.territoryId === territoryId && f.count > 0).map((f) => f.faction)
  );
  return !inside.has(faction) && inside.size >= STRONGHOLD_CAP;
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
var WORM_RIDE_SECONDS = 60;
function rideTerritories(meals, placed = []) {
  const out = /* @__PURE__ */ new Set();
  const all = [...meals.flatMap((m) => m?.devoured ?? []), ...placed];
  for (const d of all) {
    if (d.forcesSpared.some((f) => f.count > 0)) out.add(d.territoryId);
  }
  return [...out];
}
function judgeWormRide(input) {
  const { from, gather, to, forces, storm } = input;
  if (!input.rideTerritories.includes(from)) return { ok: false, refusal: "not-a-ride" };
  if (gather.length === 0 || gather.some((g) => g.count <= 0)) {
    return { ok: false, refusal: "nothing-asked" };
  }
  if (to.territoryId === from) return { ok: false, refusal: "same-territory" };
  const settled2 = settleSector(to.territoryId, to.sector);
  if (!settled2.ok) return settled2;
  if (inStorm(to.territoryId, settled2.sector, storm)) return { ok: false, refusal: "stormed" };
  if (strongholdClosed(forces, "fremen", to.territoryId)) {
    return { ok: false, refusal: "stronghold-full" };
  }
  let moving = 0;
  for (const g of gather) {
    const held = forces.find((f) => f.faction === "fremen" && f.territoryId === from && f.sector === g.sector);
    const heldStarred = Math.min(held?.count ?? 0, held?.starred ?? 0);
    if (!held || held.count < g.count || heldStarred < (g.starred ?? 0)) {
      return { ok: false, refusal: "nothing-there" };
    }
    moving += g.count;
  }
  return { ok: true, sector: settled2.sector, moving };
}
function devourTerritory(territoryId, forces, spiceOnBoard, spared) {
  const inTerritory = forces.filter((f) => f.territoryId === territoryId);
  const safe = (f) => f.faction === "fremen" || spared != null && f.faction === spared;
  return {
    territoryId,
    forcesKilled: inTerritory.filter((f) => !safe(f)),
    forcesSpared: inTerritory.filter(safe),
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
      devoured.push(devourTerritory(
        top.territoryId,
        input.forces,
        input.spiceOnBoard,
        input.spared
      ));
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
    spared: carry.spared,
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
    spared: input.spared,
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
    // NULL, NEVER UNDEFINED: the carry is stored and replayed as JSON, and
    // an explicitly-undefined key is exactly what a database would lose.
    spared: input.spared ?? null,
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
  const devoured = at.map((id) => devourTerritory(id, carry.forces, carry.spiceOnBoard, carry.spared));
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
var NEXUS_SECONDS = 300;
function countWorms(deck) {
  return [...deck?.discardA ?? [], ...deck?.discardB ?? []].filter((c) => c.kind === "shai-hulud").length;
}
function nexusDue(input) {
  return input.turn >= 2 && input.wormsAfter > input.wormsBefore && input.heldTurn !== input.turn;
}
function judgeProposal(input) {
  const { proposer, to, players } = input;
  if (proposer === to) return "yourself";
  const mine = players.find((p) => p.faction === proposer);
  const theirs = players.find((p) => p.faction === to);
  if (!mine || !theirs) return "not-seated";
  if (mine.ally) return "you-are-allied";
  if (theirs.ally) return "they-are-allied";
  return null;
}
function nexusAllReady(ready, players) {
  return players.length > 0 && players.every((p) => ready.includes(p.faction));
}
export {
  NEXUS_SECONDS,
  SHAI_HULUD_COUNT,
  WORM_RIDE_SECONDS,
  WORM_SECONDS,
  applyBlowToBoard,
  applySpicePlacement,
  beginDoubleSpiceBlow,
  buildSpiceDeck,
  countWorms,
  devourTerritory,
  judgeProposal,
  judgeWormRide,
  nexusAllReady,
  nexusDue,
  placeFremenWorms,
  publicSpiceDeck,
  resolveDoubleSpiceBlow,
  resolveSpiceBlow,
  rideTerritories,
  showing,
  shuffle
};
