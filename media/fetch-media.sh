#!/usr/bin/env bash
# Downloads the competition reference media next to this script. Run from your own machine.
set -euo pipefail
cd "$(dirname "$0")"
B=https://game.devoxx.be/references
mkdir -p venue-photos ../plans ../robots
for f in 54842743975_b835884445_k.jpg 54051790429_ea3f35ec0f_k.jpg 54051776809_eca852756c_o.jpg 54051914380_3ec9de6b8e_k.jpg 54051914325_7723ecf503_k.jpg 54051697728_3c0b8d02fc_k.jpg 54051451651_f8e07151dd_k.jpg 54051896620_c603209736_k.jpg 54051774449_c121838225_k.jpg 53231184628_4d0c05ece2_k.jpg 54835146677_0478d283b0_k.jpg 54836008506_68c9fc5562_k.jpg 54836328710_a965e6c5de_k.jpg 54836329465_b6de70d5a1_k.jpg; do
  [ -s "venue-photos/$f" ] || curl -fsSL -o "venue-photos/$f" "$B/venue/pictures/$f" && echo "photo $f"
done
for f in hollywood-area.png exhibition-floor.jpg cinema-venue-devoxx.png devoxx-rooms.jpg; do
  [ -s "../plans/$f" ] || curl -fsSL -o "../plans/$f" "$B/venue/maps/$f" && echo "plan $f"
done
for f in voxxy-robot.png droid-robot.png biggy-robot.png; do
  [ -s "../robots/$f" ] || curl -fsSL -o "../robots/$f" "$B/robots/$f?v=2" && echo "robot $f"
done
echo done
