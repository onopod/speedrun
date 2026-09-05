import * as THREE from "three";

export type RunnerVariant = "hayate" | "hikari";

// Original articulated model: all limbs attach to bones and face local -Z.
export function createRunner(variant: RunnerVariant = "hayate") {
  const root = new THREE.Group(); root.name = "runner"; root.userData.character = variant;
  const body = new THREE.Bone(); body.name = "torso"; body.position.y = 1.12; root.add(body);
  const dark = new THREE.MeshStandardMaterial({ color: variant === "hikari" ? 0x233347 : 0x17211d, roughness: .65 });
  const hair = new THREE.MeshStandardMaterial({ color: variant === "hikari" ? 0x492d41 : 0x131714, roughness: .9 });
  const green = new THREE.MeshStandardMaterial({ color: variant === "hikari" ? 0x63f6ed : 0x94ff35, emissive: variant === "hikari" ? 0x096f89 : 0x377e0a, emissiveIntensity: .6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xefbc8b, roughness: .85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe5ffdf });
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.castShadow = true; parent.add(object); return object;
  }
  mesh(body, new THREE.CapsuleGeometry(.38, .36, 4, 12), dark, 0, .22, 0);
  // Hood and a luminous chevron make the back immediately recognizable.
  mesh(body, new THREE.TorusGeometry(.32, .13, 6, 12), green, 0, .58, .1).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const stripe = mesh(body, new THREE.BoxGeometry(.075, .42, .025), green, side * .11, .24, .39);
    stripe.rotation.z = side * -.48;
  }
  const head = new THREE.Bone(); head.name = "head"; head.position.set(0, .95, -.025); body.add(head);
  mesh(head, new THREE.SphereGeometry(.48, 16, 12), skin, 0, 0, 0);
  const cap = mesh(head, new THREE.SphereGeometry(.51, 16, 12), hair, 0, .13, .1); cap.scale.set(1, .94, .95);
  for (let i = 0; i < (variant === "hikari" ? 4 : 7); i++) {
    const tuft = mesh(head, new THREE.ConeGeometry(.17, .5, 5), hair, (i % 3 - 1) * .24, .46 + (i % 2) * .05, (Math.floor(i / 3) - 1) * .19);
    tuft.rotation.z = -.4 + i * .09; tuft.rotation.x = -.35;
  }
  const ponytail = new THREE.Bone(); ponytail.name = "ponytail"; ponytail.position.set(0, .16, .42); head.add(ponytail);
  if (variant === "hikari") {
    mesh(ponytail, new THREE.SphereGeometry(.15, 8, 8), green, 0, 0, 0);
    const tail = mesh(ponytail, new THREE.CapsuleGeometry(.18, .55, 4, 8), hair, 0, -.2, .25); tail.rotation.x = -.6;
    mesh(head, new THREE.BoxGeometry(.7, .08, .18), green, 0, .28, -.37);
    mesh(body, new THREE.BoxGeometry(.34, .18, .05), green, 0, .3, -.38);
  }
  const mouth = mesh(head, new THREE.BoxGeometry(.16, .028, .035), dark, 0, -.23, -.424);
  // Face only exists on the forward side; the chase camera sees hair and hood.
  for (const side of [-1, 1]) {
    mesh(head, new THREE.SphereGeometry(.105, 8, 8), white, side * .18, 0, -.432).scale.set(1, 1.25, .4);
    mesh(head, new THREE.SphereGeometry(.061, 8, 8), green, side * .18, 0, -.476).scale.z = .35;
    mesh(head, new THREE.SphereGeometry(.026, 8, 8), hair, side * .18, 0, -.498);
    mesh(head, new THREE.SphereGeometry(.1, 8, 8), skin, side * .46, -.05, 0);
  }
  const hips: THREE.Bone[] = [], knees: THREE.Bone[] = [], arms: THREE.Bone[] = [], elbows: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Bone(); hip.position.set(side * .21, -.18, 0); body.add(hip); hips.push(hip);
    mesh(hip, new THREE.CapsuleGeometry(.16, .29, 4, 8), dark, 0, -.25, 0);
    mesh(hip, new THREE.BoxGeometry(.06, .35, .12), green, side * .16, -.2, 0);
    const knee = new THREE.Bone(); knee.position.y = -.47; hip.add(knee); knees.push(knee);
    mesh(knee, new THREE.CapsuleGeometry(.13, .25, 4, 8), dark, 0, -.18, 0);
    mesh(knee, new THREE.BoxGeometry(.34, .19, .53), dark, 0, -.4, -.12);
    mesh(knee, new THREE.BoxGeometry(.36, .065, .56), green, 0, -.5, -.13);
    const arm = new THREE.Bone(); arm.position.set(side * .46, .5, 0); body.add(arm); arms.push(arm);
    mesh(arm, new THREE.CapsuleGeometry(.135, .22, 4, 8), dark, 0, -.18, 0);
    mesh(arm, new THREE.TorusGeometry(.14, .036, 5, 10), green, 0, -.27, 0).rotation.x = Math.PI / 2;
    const elbow = new THREE.Bone(); elbow.position.y = -.37; arm.add(elbow); elbows.push(elbow);
    mesh(elbow, new THREE.CapsuleGeometry(.11, .18, 4, 8), dark, 0, -.14, 0);
    mesh(elbow, new THREE.SphereGeometry(.13, 8, 8), skin, 0, -.32, 0);
  }
  return {
    root,
    animate(time: number, running: boolean, airborne: boolean, steer: number, speed: number, lookYaw = 0) {
      const stride = Math.sin(time * (speed > 14 ? 17 : 13));
      body.position.y = 1.12 + (running && !airborne ? Math.abs(stride) * .09 : 0);
      body.rotation.set(-.08, 0, -steer * .1);
      head.rotation.set(0, lookYaw - steer * .1, 0);
      ponytail.rotation.x = running ? Math.sin(time * 17) * .25 : 0;
      mouth.rotation.z = 0;
      for (let i = 0; i < 2; i++) {
        const swing = (i === 0 ? stride : -stride) * (running ? .82 : 0);
        hips[i].rotation.x = airborne ? (i ? .35 : -.8) : swing;
        knees[i].rotation.x = airborne ? .95 : Math.max(0, -swing) * 1.1;
        arms[i].rotation.x = airborne ? -1.8 : -swing * .9;
        arms[i].rotation.z = i ? -.13 : .13;
        elbows[i].rotation.x = -1;
      }
    },
    celebrate(time: number, grade: "great" | "good" | "retry") {
      // Turn is handled by the scene; each full-body pose stays at the goal.
      const t = Math.max(0, time - .65), wave = Math.sin(t * 7);
      body.rotation.set(0, 0, 0); body.position.y = 1.12;
      head.rotation.set(0, 0, 0); ponytail.rotation.x = Math.sin(t * 5) * .12;
      hips.forEach(b => b.rotation.set(0, 0, 0)); knees.forEach(b => b.rotation.set(0, 0, 0));
      arms.forEach((b, i) => b.rotation.set(0, 0, i ? -.13 : .13));
      elbows.forEach(b => b.rotation.set(-.4, 0, 0));
      if (grade === "great") {
        body.position.y += Math.max(0, Math.sin(t * 4)) * .55;
        arms[0].rotation.z = 2.4; arms[1].rotation.z = -2.4;
        elbows.forEach(b => b.rotation.x = -.5 + wave * .15);
        head.rotation.z = wave * .08;
      } else if (grade === "good") {
        arms[1].rotation.z = -2.1 + wave * .18; elbows[1].rotation.x = -.35;
        head.rotation.z = -.12; body.rotation.z = -.06;
      } else {
        // A sheepish head scratch, then a small "next time" nod.
        body.rotation.x = -.12; head.rotation.x = -.22 + Math.sin(t * 3) * .08;
        arms[0].rotation.set(-.2, 0, 2.25); elbows[0].rotation.x = -1.35 + wave * .15;
        mouth.rotation.z = -.15;
      }
    },
  };
}
