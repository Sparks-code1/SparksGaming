// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/karama.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact karama uses and suppression the client runs. The server MUST run the same
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

// src/data/dune/treachery.ts
var KEEP_IF_WON = " You may keep this card if you win this battle.";
var WORTHLESS = "Play as part of your Battle Plan, in place of a weapon, defense, or both.\n\nThis card has no value in play, and you can discard it only by playing it in your Battle Plan.";
var PLAY_IN_PLAN = "Play as part of your Battle Plan.";
var TREACHERY_CARDS = [
  // ── Projectile weapons ────────────────────────────────────────────────────
  // Four of them, one copy each, all with the same text and all stopped by a
  // Shield. They differ only by name — and now by picture. Four of the five
  // weapon images are square; the Maula Pistol is wide, which is why the art box
  // fits an image to the whole box rather than to a square inside it.
  {
    id: "crysknife",
    name: "Crysknife",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Crysknife.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "stunner",
    name: "Stunner",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Stunner.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "sliptip",
    name: "Slip Tip",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Slip_tip.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  {
    id: "maulapistol",
    name: "Maula Pistol",
    kind: "weapon",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Maula_Pistol.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Shield." + KEEP_IF_WON
  },
  // ── Poison weapons ────────────────────────────────────────────────────────
  {
    id: "gomjabbar",
    name: "Gom Jabbar",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Gom_Jabbar.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "ellacadrug",
    name: "Ellaca Drug",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Ellaca_Drug.png",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "chaumas",
    name: "Chaumas",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Chaumas.jpg",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  {
    id: "chaumurky",
    name: "Chaumurky",
    kind: "weapon",
    subtype: "poison",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Chaumurky.jpg",
    text: PLAY_IN_PLAN + " Kills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper." + KEEP_IF_WON
  },
  // ── The one weapon nothing defends against ────────────────────────────────
  // Its class is its own, and there is no defence card to match it. That is the
  // card, not a gap in the data: a Shield played in the same battle does not
  // save anyone, it destroys the territory.
  //
  // RULING: "anyone" includes the Lasgun's own owner. A Lasgun and a Shield on
  // the table together destroy the territory whoever held which — shielding your
  // own leader behind your own Lasgun sets it off exactly as the defender's
  // Shield would.
  //
  // So the explosion is a property of the PAIR being present, not of who played
  // what. Battle resolution should ask "were both cards played in this battle",
  // never "did my opponent play a Shield". The word carrying that is "anyone",
  // and treacherytest pins it, because nothing else in the repo can enforce a
  // battle rule while battles do not exist.
  {
    id: "lasgun",
    name: "Lasgun",
    kind: "weapon",
    subtype: "lasgun",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/Lasgun.png",
    text: PLAY_IN_PLAN + "\n\nAutomatically kills opponent's leader regardless of defense card used.\n\nYou may keep this card if you win this battle.\n\nIf anyone plays a Shield in this battle all forces, leaders, and spice in this battle's territory are lost to the Tleilaxu Tanks. Both players lost this battle, no spice is paid for leaders, and all cards played are discarded."
  },
  // ── Defences ──────────────────────────────────────────────────────────────
  {
    id: "shield",
    name: "Shield",
    kind: "defense",
    subtype: "projectile",
    timing: "battle-plan",
    copies: 4,
    image: "/treachery/Shield.png",
    text: PLAY_IN_PLAN + "\n\nProtects your leader from a projectile weapon in this battle.\n\nYou may keep this card if you win this battle."
  },
  {
    id: "snooper",
    name: "Snooper",
    kind: "defense",
    subtype: "poison",
    timing: "battle-plan",
    copies: 4,
    image: "/treachery/Snooper.png",
    text: PLAY_IN_PLAN + "\n\nProtects your leader from a poison weapon in this battle.\n\nYou may keep this card if you win this battle."
  },
  // ── Worthless ─────────────────────────────────────────────────────────────
  // Five cards, one copy each, rather than one card five times. They are
  // mechanically identical — same text, same timing, same nothing — and differ
  // only in name and picture, which is the whole joke: five ordinary objects
  // from a desert planet, none of which will win you a battle.
  //
  // The names are the ones Dune prints. Worth checking against your own copy:
  // they came from memory of the game rather than from anything in this repo,
  // and this is the second time that has been a way to be wrong.
  {
    id: "baliset",
    name: "Baliset",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/baliset.svg",
    text: WORTHLESS
  },
  {
    id: "jubbacloak",
    name: "Jubba Cloak",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/jubba-cloak.svg",
    text: WORTHLESS
  },
  {
    id: "kulon",
    name: "Kulon",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/kulon.svg",
    text: WORTHLESS
  },
  {
    id: "lalala",
    name: "LA, LA, LA",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/la-la-la.svg",
    text: WORTHLESS
  },
  {
    id: "triptogamont",
    name: "Trip to Gamont",
    kind: "worthless",
    subtype: "none",
    timing: "battle-plan",
    copies: 1,
    image: "/treachery/trip-to-gamont.svg",
    text: WORTHLESS
  },
  // ── Specials ──────────────────────────────────────────────────────────────
  {
    id: "cheaphero",
    name: "Cheap Hero",
    kind: "special",
    subtype: "leader",
    timing: "battle-plan",
    copies: 3,
    image: "/treachery/Cheap_Hero.png",
    text: "Play as a leader with zero strength on your Battle Plan and discard after the battle.\n\nYou may also play a weapon and a defense. The cheap hero may be played in place of a leader or when you have no leaders available."
  },
  {
    id: "truthtrance",
    name: "Truthtrance",
    kind: "special",
    subtype: "information",
    timing: "any-time",
    copies: 2,
    image: "/treachery/Truthtrance.png",
    // REWRITTEN, and the only card in the deck whose text is not the printed
    // one. The printed card asks a player to answer truthfully; nothing can hold
    // them to it, and the questions worth asking are about intent, which is not
    // state and never becomes checkable. So the server answers instead of the
    // player, out of a fixed set of questions it can prove — see
    // lib/dune/truthtrance.ts for the set and for what had to be given up.
    text: "Play at any time. Name another player and choose one question from the Truthtrance list.\n\nThe question and its answer are announced to every player. The answer is yes or no, and is always true."
  },
  {
    id: "tleilaxughola",
    name: "Tleilaxu Ghola",
    kind: "special",
    subtype: "revival",
    timing: "any-time",
    copies: 1,
    image: "/treachery/Tleilaxu_Ghola.png",
    text: "Play at any time to gain an extra revival.\n\nYou may immediately revive 1 of your leaders regardless of how many leaders you have in the tanks, or up to 5 of your forces from the Tleilaxu Tanks to your reserves at no cost in spice."
  },
  {
    id: "hajr",
    name: "Hajr",
    kind: "special",
    subtype: "movement",
    timing: "movement",
    copies: 1,
    image: "/treachery/HAJR.png",
    text: "Play during Movement Phase.\n\nMake an extra on-planet force movement subject to normal movement rules.\n\nThe forces you move may be a group you've already moved this phase or another group."
  },
  {
    id: "weathercontrol",
    name: "Weather Control",
    kind: "special",
    subtype: "storm",
    timing: "storm-before-roll",
    copies: 1,
    image: "/treachery/weather_control.png",
    text: "After the first game turn, play during the Storm Phase before the Storm Marker is moved.\n\nWhen you play this card, you control the storm this phase and may move it from 0 to 10 sectors in a counterclockwise direction."
  },
  {
    id: "karama",
    name: "Karama",
    kind: "special",
    subtype: "none",
    timing: "any-time",
    copies: 2,
    // Text by design, not by omission — there is more rules text here than a
    // picture would leave room for.
    textOnly: true,
    // The text below is the BASIC card. In the advanced game it gains a second,
    // alternative use: instead of stopping an opponent's advantage, spend it on
    // your own faction's Karama power. Those live on the factions rather than
    // here — see AdvancedRules.karama — because they differ per faction and the
    // card is the same card. Either use, not both, and it discards afterwards.
    text: 'After the factions complete their "At Start" actions and after game set-up, use this card to stop a player from using one of their faction advantages when they attempt to use it. Stops the use of that advantage during one game phase.\n\nOr, this card may be used to do either of these things when appropriate:\n\nPurchase a shipment of forces onto the planet at Guild rates (1/2 normal) not paid to the Spacing Guild, or\n\nPurchase a Treachery Card without paying spice for it.\n\nCannot be used to stop a win condition advantage. Discard after use.'
  },
  {
    id: "familyatomics",
    name: "Family Atomics",
    kind: "special",
    subtype: "storm",
    timing: "storm-after-roll",
    copies: 1,
    image: "/treachery/Family_atomics.png",
    text: "After the first game turn, play after the storm movement is calculated, but before the storm is moved, but only if you have one or more forces on the Shield Wall or a territory adjacent to the Shield Wall with no storm between your sector and the Wall.\n\nAll forces on the Shield Wall are destroyed.\n\nThe Shield Wall now turns blue as a reminder. The Imperial Basin, Arrakeen, and Carthag are no longer protected from the Storm for the rest of the game."
  }
];

// src/data/dune/factions.ts
var ATREIDES = {
  id: "atreides",
  name: "Atreides",
  startingSpice: 10,
  forces: {
    onPlanet: 10,
    placement: { kind: "fixed", territoryId: "territory-13" },
    // Arrakeen
    reserves: 10,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 2,
  abilities: {
    bidding: "Atreides may look at each Treachery Card as it comes up for purchase before any faction bids on it.",
    movement: "At the start of the Movement Phase, before anyone moves, you may look at the top card of the Spice Deck.",
    battle: "During the Battle Phase, you may force your opponent to reveal your choice of one of the four elements of battle (the leader, the weapon, the defense, or the forces in battle) before they reveal their choice."
  },
  alliance: "The Atreides may assist your allies by forcing their opponent to show them one element of their battle plan.",
  advanced: {
    karama: "You may use a Karama Card to look at any one player's entire Battle Plan.",
    kwisatzHaderach: "Use the Kwisatz Haderach card and counter token to secretly keep track of force losses. Once you have lost 7 or more forces in a battle or battles, the Kwisatz Haderach card becomes active for the rest of the game and may be used as follows: it cannot be used alone in battle but may add its +2 strength to leaders or cheap heroes in one territory per turn. If the leader or cheap hero is killed, the Kwisatz Haderach has no effect in the battle. A leader accompanied by Kwisatz Haderach cannot turn traitor. The Kwisatz Haderach can only be killed if blown up by a lasgun/shield explosion. If killed, the Kwisatz Haderach must be revived like any other leader. Alive or dead, the Kwisatz Haderach has no effect on the rule governing revival of Atreides leaders."
  },
  // Nothing here is beyond a Karama card.
  unsuppressable: [],
  karamaStops: {
    "abilities.bidding": { stops: "Seeing each Treachery Card before the bidding.", enforced: true },
    "abilities.movement": { stops: "Looking at the top of the Spice Deck before the move.", enforced: false },
    "abilities.battle": { stops: "Forcing an opponent to reveal one element of their battle plan.", enforced: true },
    "advanced.kwisatzHaderach": { stops: "The Kwisatz Haderach adding its +2 to a leader.", enforced: false }
  },
  leaders: [
    { name: "Lady Jessica", strength: 5 },
    { name: "Thufir Hawat", strength: 5 },
    { name: "Gurney Halleck", strength: 4 },
    { name: "Duncan Idaho", strength: 2 },
    { name: "Dr. Wellington Yueh", strength: 1 }
  ]
};
var EMPEROR = {
  id: "emperor",
  name: "Emperor",
  startingSpice: 10,
  forces: {
    onPlanet: 0,
    placement: { kind: "reserve-only" },
    reserves: 20,
    starred: 5
    // Sardaukar — see StartingForces.starred
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    bidding: "Whenever any other faction pays spice for a Treachery card, they pay it to you instead of the Spice Bank. You may not discount the price of Treachery Cards; the full price must be paid."
  },
  alliance: "You may share your great wealth with your allies as well as paying spice (directly to the bank) for the revival of up to 3 extra of their forces (for a possible total of 6 during each revival phase) from the Tleilaxu tanks.",
  advanced: {
    karama: "You may use a Karama Card to revive up to three forces or one leader for free.",
    // UNDER `forces`, not `general`. The card labels each entry with the key it
    // came from, and GENERAL says nothing — where FORCES says which of these
    // rules is the one about your soldiers. The Fremen's Fedaykin entry has
    // always been shaped this way; this is the same rule for the same reason.
    //
    // The rulebook's opening clause, "If you are playing the advanced game,
    // Sardaukar is in play", is dropped: it sits on the back of the card, which
    // is the advanced side and says so.
    forces: "Sardaukar: Your 5 starred forces, elite Sardaukar, have a special fighting capability. They are worth two normal forces in battle and in taking losses against all opponents except Fremen. Your starred forces are worth just one force against Fremen. They are treated as one force in revival. Only one Sardaukar force can be revived per turn."
  },
  unsuppressable: [],
  karamaStops: {
    "abilities.bidding": { stops: "Being paid the spice other factions spend on Treachery Cards.", enforced: true },
    "advanced.forces": { stops: "Sardaukar counting double in battle and in taking losses.", enforced: true }
  },
  leaders: [
    { name: "Hasimir Fenring", strength: 6 },
    { name: "Captain Aramsham", strength: 5 },
    { name: "Caid", strength: 3 },
    { name: "Burseg", strength: 3 },
    { name: "Bashar", strength: 2 }
  ]
};
var FREMEN = {
  id: "fremen",
  name: "Fremen",
  startingSpice: 3,
  forces: {
    onPlanet: 10,
    // Distributed by the player at setup, in whatever split they choose.
    placement: {
      kind: "distribute",
      among: [
        "territory-40",
        // Sietch Tabr
        "territory-17",
        // False Wall South
        "territory-10"
        // False Wall West
      ]
    },
    reserves: 10,
    starred: 3
    // Fedaykin — see StartingForces.starred
  },
  // The one faction whose reserves are already on Arrakis. This is what makes
  // their shipment free and keeps them out of the Guild's income — see
  // ReserveLocation.
  reservesHeld: "on-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 3,
  abilities: {
    shipment: "You may bring any or all of your reserves for free onto the Great Flat or onto any one territory within two territories of the Great Flat (subject to storm and occupancy rules).",
    movement: "You may move your forces two territories instead of one.",
    shaiHulud: "If Shai-Hulud appears in a territory where you have forces, they are not devoured. Upon conclusion of the Nexus, you may ride the sandworm and move some or all of the forces in that territory to any territory subject to storm and occupancy rules. Any forces in that territory are not devoured. If Shai-Hulud appears again and you still have forces in the original territory, you may do this again."
  },
  alliance: "You may choose to protect (or not protect) your allies from the effects of Shai-Hulud (sandworm), and at your discretion, may also allow them to revive 3 forces for free during the revival phase. In addition, your allies win with you if you win with the special victory condition.",
  specialVictory: "If no faction has won by the end of turn 10, and you (or no one) occupies Sietch Tabr and Habbanya Sietch, and neither Harkonnen, Atreides nor Emperor occupies Tuek's Sietch, you and your allies win the game.",
  advanced: {
    karama: "You may use a Karama Card to place your sandworm token in any sand territory that you wish. This is treated as a normal sandworm.",
    storm: "The first storm in the game is normal. All subsequent storms can move either 1-6 sectors and you get to know the number of sectors before the storm moves on the previous turn.",
    spiceBlow: "Sandworms: During a spice blow, all additional sandworms that appear after the first sandworm can be placed by you in any territory, any forces there except yours are devoured. Storm Losses: If your forces are caught in a storm, only half of them are killed (rounded up).",
    shipment: "You may also bring your reserves into a storm at half losses.",
    forces: "Fedaykin: Your 3 starred forces, elite Fedaykin, have a special fighting capability. They are worth two normal forces in battle and in taking losses against all opponents. They are treated as one force in revival. Only one Fedaykin force can be revived per turn.",
    battle: "Your forces do not require spice to count at their full strength."
  },
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ["specialVictory"],
  karamaStops: {
    "abilities.shipment": { stops: "Riding free onto the Great Flat, or within two territories of it.", enforced: true },
    "abilities.movement": { stops: "Moving two territories instead of one.", enforced: false },
    "abilities.shaiHulud": { stops: "Surviving Shai-Hulud, and riding it after the Nexus.", enforced: false },
    "advanced.storm": { stops: "Knowing the storm distance a turn early.", enforced: true },
    "advanced.spiceBlow": { stops: "Placing every sandworm after the first, and half losses in a storm.", enforced: false },
    "advanced.shipment": { stops: "Shipping into a storm at half losses.", enforced: true },
    "advanced.forces": { stops: "Fedaykin counting double in battle and in taking losses.", enforced: true },
    "advanced.battle": { stops: "Fighting at full strength without spice.", enforced: true }
  },
  leaders: [
    { name: "Stilgar", strength: 7 },
    { name: "Chani", strength: 6 },
    { name: "Otheym", strength: 5 },
    { name: "Shadout Mapes", strength: 3 },
    { name: "Jamis", strength: 2 }
  ]
};
var SPACING_GUILD = {
  id: "spacing-guild",
  name: "Spacing Guild",
  startingSpice: 5,
  forces: {
    onPlanet: 5,
    placement: { kind: "fixed", territoryId: "territory-33" },
    // Tuek's Sietch
    reserves: 15,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    shipment: "When other factions ship forces on to Dune, from their off-planet reserves, they pay the spice to you instead of to the Spice Bank. You are able to make three types of shipment: (1) you may ship normally from off planet reserves, (2) you may ship any number of forces from any one territory to any other territory on the board, or (3) you may ship any number of forces from any one territory back to your reserves. You pay half the normal fee when shipping your forces, and pay 1 spice for every 2 of your forces shipped back to reserves."
  },
  alliance: "Allies may ship from their off-planet reserves onto Dune or cross-ship from one territory to another with forces that are already on Dune at the half-price rate. In addition, allies win with the Spacing Guild Special Victory Condition.",
  specialVictory: "If no faction has been able to win the game by the end of play, you automatically win the game.",
  advanced: {
    karama: "You may use a Karama Card to stop one off-planet shipment of any one player.",
    shipment: "You may take your shipment and move action out of turn. This would allow you to go first or last or in between other players' turns, however you wish. The rest of the factions must make their shipments and moves in the proper sequence. You do not have to reveal when you intend to make your shipment and movement until the moment you wish to take it."
  },
  // Their special victory. Karama cannot stop a win condition.
  unsuppressable: ["specialVictory"],
  karamaStops: {
    "abilities.shipment": { stops: "Collecting the shipping fees, and shipping at half rate.", enforced: true },
    "abilities.shipment#kinds": { stops: "Shipping between territories, and back to reserves.", enforced: true },
    "advanced.shipment": { stops: "Taking their shipment and move out of turn.", enforced: true }
  },
  leaders: [
    { name: "Staban Tuek", strength: 5 },
    { name: "Master Bewt", strength: 3 },
    { name: "Esmar Tuek", strength: 3 },
    { name: "Soo-Soo Sook", strength: 2 },
    { name: "Guild Representative", strength: 1 }
  ]
};
var BENE_GESSERIT = {
  id: "bene-gesserit",
  name: "Bene Gesserit",
  startingSpice: 5,
  forces: {
    onPlanet: 1,
    placement: { kind: "fixed", territoryId: "territory-03" },
    // Polar Sink
    reserves: 19,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 4,
  startingTreachery: 1,
  freeRevivals: 1,
  abilities: {
    beforeGame: "When selecting this faction you secretly predict when one other faction will win, choosing the turn number and faction, this will remain a secret until game end. If your prediction is correct, your prediction is revealed and you and your allies win the game and win alone, you cannot predict the spacing-guild or Fremen will win with their special victory conditions",
    shipment: "Whenever any other faction ships forces onto Dune from off-planet, you may ship 1 force for free from your reserves into the Polar Sink. You may also ship normally, of course.",
    battle: "You may Voice your opponent to do as you wish with respect to one of the cards they play in their battle. For instance, to play or not play a specific weapon (poison weapon, projectile weapon, or lasgun) or defense (snooper or shield), a worthless card, or a cheap hero. If your opponent cannot comply with your command, they may do as they wish."
  },
  alliance: "You may Voice an ally opponent",
  advanced: {
    beforeGame: "After the fremen placement in the first turn (if that faction is in the game) you start with one peaceful advisor in any territory of your choice. If you are alone in the territory, the advisor turns into a fighter.",
    shipment: "Whenever any other faction ships forces to Dune from off-planet, you may ship for free one advisor from your reserves into that same territory (instead of the Polar Sink).",
    charity: "You always receive CHOAM charity of 2 spice regardless of how many spice you already have.",
    // NOT from docs/dune-advance-rules.md — that file lists Karama powers for
    // five factions and omits the Bene Gesserit entirely, which is how their
    // absence came to be read as "they get nothing". This wording is mine and
    // wants replacing with yours.
    treachery: "You may play a Worthless Card as though it were a Karama Card.",
    advisors: "Advisors coexist peacefully with other faction forces in the same territory. Advisors have no effect on the play of the other factions whatsoever and cannot collect spice, be involved in combat, prevent another faction from challenging a stronghold (second force), use ornithopters, or play Family Atomics. Advisors are susceptible to storms, sandworms, lasgun/shield explosions, and atomics.",
    fighters: "When you ship forces into an unoccupied territory, you must ship as fighters. If you move advisors into an unoccupied territory they turn into fighters. If you move advisors into occupied territories they remain as advisors or flip to fighters; fighters follow the same rules for battles. When another faction ships or moves into a territory where you have fighters, you may flip them to advisors.",
    battle: "On each turn after the Spice Blow and Nexus Phase and before any shipment occurs, in all territories in which you have advisors and wish to battle, announce you are doing so and turn all those advisors to fighters."
  },
  // The prediction win, which lives in abilities.beforeGame rather than in
  // specialVictory — see the note on Faction.unsuppressable.
  unsuppressable: ["abilities.beforeGame"],
  karamaStops: {
    "abilities.shipment": { stops: "Shipping one force free into the Polar Sink.", enforced: false },
    "abilities.battle": { stops: "The Voice: commanding one card in an opponent battle plan.", enforced: true },
    "advanced.shipment": { stops: "Shipping one advisor free into a territory somebody else ships into.", enforced: false },
    "advanced.charity": { stops: "Always collecting CHOAM charity, whatever they hold.", enforced: false },
    "advanced.advisors": { stops: "Advisors sharing a territory without a fight.", enforced: false },
    "advanced.fighters": { stops: "Flipping fighters to advisors when somebody arrives.", enforced: false },
    "advanced.battle": { stops: "Standing advisors up as fighters before the shipment.", enforced: false }
  },
  leaders: [
    { name: "Mother Ramallo", strength: 5 },
    { name: "Wanna Yueh", strength: 5 },
    { name: "Margot Lady Fenring", strength: 5 },
    { name: "Princess Irulan", strength: 5 },
    { name: "Alia", strength: 5 }
  ]
};
var HARKONNEN = {
  id: "harkonnen",
  name: "Harkonnen",
  startingSpice: 10,
  forces: {
    onPlanet: 10,
    placement: { kind: "fixed", territoryId: "territory-26" },
    // Carthag
    reserves: 10,
    starred: 0
  },
  reservesHeld: "off-planet",
  handLimit: 8,
  startingTreachery: 2,
  freeRevivals: 2,
  abilities: {
    traitors: "At the start of the game when you draw 4 Traitor Cards, you keep them all, including your own, and any leader cards of other factions can be revealed in a battle as a traitor.",
    treachery: "You may hold up to 8 Treachery Cards. When you have 8 cards you must pass during bidding. At the beginning of the game you are dealt 2 cards instead of 1, and every time you buy a card you get an extra card for free from the Treachery Deck (unless you are at 7 cards, because you can never have more than 8 in your hand)."
  },
  alliance: "Traitor Cards that you hold may be used against your ally's opponent if you so choose",
  advanced: {
    karama: "You may use a Karama Card to take without looking any number of cards, up to the entire hand of any one player of your choice. For each card you take, you must give that player one of your cards in return.",
    capturedLeaders: "Every time you win a battle, you can either randomly select 1 leader from the loser (including the leader used in battle, if not killed, but excluding all leaders already used elsewhere that turn) and place the Leader Disc face down into the Tleilaxu Tanks to gain 2 spice from the Spice Bank; or you can keep the leader and use it once in a battle, after which, if it was not killed during that battle, you must return that leader to its faction. When all of your own leaders have been killed, you must return all captured leaders immediately to their factions. Killed leaders are put in the Tleilaxu Tanks from which their factions can revive them (subject to revival rules). A captured leader used in battle may be claimed as a traitor"
  },
  unsuppressable: [],
  karamaStops: {
    "abilities.treachery": { stops: "The extra Treachery Card they draw whenever they buy one.", enforced: true },
    "advanced.capturedLeaders": { stops: "Capturing a leader from a battle they win.", enforced: false }
  },
  leaders: [
    { name: "Feyd-Rautha", strength: 6 },
    { name: "Beast Rabban", strength: 4 },
    { name: "Piter De Vries", strength: 3 },
    { name: "Captain Iakin Nefud", strength: 2 },
    { name: "Umman Kudu", strength: 1 }
  ]
};
var FACTIONS = {
  atreides: ATREIDES,
  emperor: EMPEROR,
  fremen: FREMEN,
  "spacing-guild": SPACING_GUILD,
  harkonnen: HARKONNEN,
  "bene-gesserit": BENE_GESSERIT
};
function canKaramaStop(f, ref) {
  const field = ref.split("#")[0];
  return !f.unsuppressable.includes(ref) && !f.unsuppressable.includes(field);
}

// src/lib/dune/spiceBlow.ts
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

// src/types/Dune/Game.ts
var DUNE_PHASES = [
  "Storm",
  "Spice Blow and Nexus",
  "CHOAM Charity",
  "Bidding",
  "Revival",
  "Shipment and Movement",
  "Battles",
  "Spice Collection",
  "Mentat Pause"
];

// src/lib/dune/karama.ts
var OWNER = {
  "atreides-see-battle-plan": "atreides",
  "emperor-free-revival": "emperor",
  "fremen-place-worm": "fremen",
  "guild-stop-shipment": "spacing-guild",
  "harkonnen-take-cards": "harkonnen"
};
var BASIC = [
  {
    id: "guild-rate-shipment",
    label: "Ship at Guild rates",
    text: "Purchase a shipment of forces onto the planet at Guild rates (1/2 normal) not paid to the Spacing Guild."
  },
  {
    id: "free-treachery-card",
    label: "Take a Treachery Card free",
    text: "Purchase a Treachery Card without paying spice for it."
  }
];
var LABELS = {
  "atreides-see-battle-plan": "Look at a player's Battle Plan",
  "emperor-free-revival": "Revive free",
  "fremen-place-worm": "Place a sandworm",
  "guild-stop-shipment": "Stop an off-planet shipment",
  "harkonnen-take-cards": "Take cards from a hand"
};
var RESOLVABLE = [
  "guild-rate-shipment",
  "free-treachery-card",
  "atreides-see-battle-plan",
  "emperor-free-revival",
  "fremen-place-worm",
  "guild-stop-shipment",
  "harkonnen-take-cards"
];
function karamaOptions(faction, mode) {
  const options = BASIC.map((o) => ({ ...o, resolvable: RESOLVABLE.includes(o.id) }));
  if (mode !== "advanced") return options;
  const own = Object.keys(OWNER).find((id) => OWNER[id] === faction);
  const text = FACTIONS[faction]?.advanced.karama;
  if (own && text) {
    options.push({ id: own, label: LABELS[own], text, resolvable: RESOLVABLE.includes(own) });
  }
  return options;
}
var PENDING = {
  "guild-rate-shipment": "a shipment at half rate, paid to the bank rather than the Guild \u2014 needs the shipment phase",
  "free-treachery-card": "one treachery card at no cost \u2014 needs bidding",
  "atreides-see-battle-plan": "sight of one player's whole battle plan \u2014 needs battle plans",
  "emperor-free-revival": "a free revival of up to three forces or one leader \u2014 needs the revival phase",
  "fremen-place-worm": "",
  "guild-stop-shipment": "one player's off-planet shipment stopped \u2014 needs the shipment phase",
  "harkonnen-take-cards": "cards taken blind from a hand, one given back for each \u2014 needs hidden hands"
};
function playKarama(input) {
  const { faction, mode, use } = input;
  const allowed = karamaOptions(faction, mode).some((o) => o.id === use.id);
  if (!allowed) {
    const owner = OWNER[use.id];
    throw new Error(
      owner && owner !== faction ? `${use.id} is the ${owner} power; ${faction} cannot play it` : owner ? `${use.id} is an advanced power and this is the ${mode} game` : `${faction} cannot play ${use.id}`
    );
  }
  if (use.id === "fremen-place-worm") {
    const t = DUNE_TERRITORIES.find((x) => x.id === use.territoryId);
    if (!t) throw new Error(`no such territory to place a worm in: ${use.territoryId}`);
    if (t.terrain !== "sand") {
      throw new Error(`a Karama worm goes in sand; ${t.displayName} is ${t.terrain}`);
    }
    const spice = input.spiceOnBoard ?? {};
    const devoured = devourTerritory(
      use.territoryId,
      input.forces ?? [],
      spice,
      input.spared
    );
    const after = { ...spice };
    delete after[use.territoryId];
    return {
      use,
      discarded: true,
      resolved: { kind: "worm-placed", devoured, spiceOnBoard: after, toTanks: devoured.forcesKilled },
      pending: null
    };
  }
  return { use, discarded: true, resolved: null, pending: PENDING[use.id] };
}
function isKaramaFor(faction, mode, card) {
  if (card.id === "karama") return true;
  return mode === "advanced" && faction === "bene-gesserit" && card.kind === "worthless";
}
var KARAMA_GIVE_SECONDS = 60;
function stoppablePhases(current) {
  const i = DUNE_PHASES.indexOf(current);
  return i < 0 ? [] : DUNE_PHASES.slice(i);
}
function mayStopIn(current, named) {
  return stoppablePhases(current).includes(named);
}
function isSuppressed(list, faction, ref, turn, phase) {
  return (list ?? []).some((s) => s.faction === faction && s.ref === ref && s.turn === turn && s.phase === phase);
}
function suppressibleRefs(faction) {
  const f = FACTIONS[faction];
  if (!f) return [];
  return Object.entries(f.karamaStops).flatMap(([ref, stop]) => stop && stop.enforced && stop.stops && canKaramaStop(f, ref) ? [{ ref, text: stop.stops }] : []);
}
function isKaramaCardId(faction, mode, cardId) {
  const card = TREACHERY_CARDS.find((c) => c.id === cardId);
  return !!card && isKaramaFor(faction, mode, card);
}
function karamaAllowed(faction, mode, useId) {
  if (karamaOptions(faction, mode).some((o) => o.id === useId)) return null;
  const owner = OWNER[useId];
  if (owner && owner !== faction) return "not-your-power";
  return "advanced-only";
}
export {
  KARAMA_GIVE_SECONDS,
  isKaramaCardId,
  isKaramaFor,
  isSuppressed,
  karamaAllowed,
  karamaOptions,
  mayStopIn,
  playKarama,
  stoppablePhases,
  suppressibleRefs
};
