(function () {
  'use strict';

  window.BoxAlarmAssets = {
    trucks: {
      engine: {
        key: 'engine',
        label: 'Engine Company',
        wheelbase: 2.05,
        bodyHeight: 0.76,
        bodyWidth: 0.82,
        cabLength: 0.62,
        defaultLivery: {
          main: 0xca1b2e,
          trim: 0xf7e0a2
        }
      },
      ladder: {
        key: 'ladder',
        label: 'Ladder Company',
        wheelbase: 2.15,
        bodyHeight: 0.8,
        bodyWidth: 0.82,
        cabLength: 0.62,
        ladderLength: 1.6,
        defaultLivery: {
          main: 0xbf1328,
          trim: 0xf7e0a2
        }
      },
      ambulance: {
        key: 'ambulance',
        label: 'Ambulance',
        wheelbase: 1.95,
        bodyHeight: 0.82,
        bodyWidth: 0.82,
        cabLength: 0.6,
        defaultLivery: {
          main: 0xf0f2f5,
          trim: 0xbf1328
        }
      }
    },
    firefighters: {
      captain: {
        rank: 'captain',
        speedMultiplier: 0.95,
        color: 0xffde62
      },
      lieutenant: {
        rank: 'lieutenant',
        speedMultiplier: 1.0,
        color: 0x96bcff
      },
      firefighter: {
        rank: 'firefighter',
        speedMultiplier: 1.05,
        color: 0xd8e7f7
      },
      proby: {
        rank: 'proby',
        speedMultiplier: 0.8,
        color: 0x7ad39f
      },
      ems: {
        rank: 'ems',
        speedMultiplier: 1.0,
        color: 0xffa6a6
      }
    }
  };
})();
