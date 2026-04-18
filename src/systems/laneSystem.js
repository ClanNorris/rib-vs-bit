export function createLaneSystem(scene) {
  let destroyed = false;

  const state = {
    platforms: [],
    vehicles: [],
    platformDecorations: [],
  };

  function register(world) {
    state.platforms = world.platforms ?? [];
    state.vehicles = world.vehicles ?? [];
    state.platformDecorations = world.platformDecorations ?? [];
  }

  function updatePlatformPosition(obj, dt, totalWidth, wrapPadding) {
    obj.x += obj.lane.dir * obj.lane.speed * dt;
    const half = obj.width / 2;

    if (obj.x - half > totalWidth + wrapPadding) {
      obj.x = -wrapPadding;
    } else if (obj.x + half < -wrapPadding) {
      obj.x = totalWidth + wrapPadding;
    }
  }

  function updateTurtleDecoration(deco, now) {
  const phase = now * deco.turtleBobSpeed + deco.turtleBobPhase;

  // Single source of truth for motion
  const dip = Math.sin(phase);

  // Vertical bob
  const bobOffset = dip * deco.turtleBobAmplitude;

  // NEW: squash/stretch for water dip effect
  const scaleY = deco.turtleBaseScale * (1 - dip * deco.turtlePulseAmplitude);
  const scaleX = deco.turtleBaseScale * (1 + dip * deco.turtlePulseAmplitude * 0.5);

  deco.x = deco.host.x + deco.offsetX;
  deco.y = deco.host.y + bobOffset;

  deco.setScale(scaleX, scaleY);
}

  function updateGenericDecoration(deco) {
    deco.x = deco.host.x + deco.offsetX;
    deco.y = deco.host.y;
  }

  function update(dt) {
    if (destroyed) return;

    const wrapPadding = scene.tileSize * 2.5;
    const totalWidth = scene.width;
    const now = scene.time.now;

    for (const obj of state.platforms) {
      if (!obj?.lane) continue;
      updatePlatformPosition(obj, dt, totalWidth, wrapPadding);
    }

    for (const deco of state.platformDecorations) {
      if (!deco?.host) continue;

      if (deco.isTurtleDecoration) {
        updateTurtleDecoration(deco, now);
      } else {
        updateGenericDecoration(deco);
      }
    }

    for (const obj of state.vehicles) {
      if (!obj?.lane) continue;
      updatePlatformPosition(obj, dt, totalWidth, wrapPadding);
    }
  }

  function destroy() {
    destroyed = true;
    state.platforms = [];
    state.vehicles = [];
    state.platformDecorations = [];
  }

  return {
    register,
    update,
    destroy,
  };
}