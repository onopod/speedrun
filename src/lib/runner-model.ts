import * as THREE from "three";

// Original articulated model: all limbs attach to bones and face local -Z.
export function createRunner() {
  const root = new THREE.Group();
  const body = new THREE.Bone(); body.position.y = 1.12; root.add(body);
  const dark = new THREE.MeshStandardMaterial({ color: 0x17211d, roughness: .65 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x131714, roughness: .9 });
  const green = new THREE.MeshStandardMaterial({ color: 0x94ff35, emissive: 0x377e0a, emissiveIntensity: .6 });
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
  const head = new THREE.Bone(); head.position.set(0, .95, -.025); body.add(head);
  mesh(head, new THREE.SphereGeometry(.48, 16, 12), skin, 0, 0, 0);
  const cap = mesh(head, new THREE.SphereGeometry(.51, 16, 12), hair, 0, .13, .1); cap.scale.set(1, .94, .95);
  for (let i = 0; i < 7; i++) {
    const tuft = mesh(head, new THREE.ConeGeometry(.17, .5, 5), hair, (i % 3 - 1) * .24, .46 + (i % 2) * .05, (Math.floor(i / 3) - 1) * .19);
    tuft.rotation.z = -.4 + i * .09; tuft.rotation.x = -.35;
  }
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
    animate(time: number, running: boolean, airborne: boolean, steer: number, speed: number) {
      const stride = Math.sin(time * (speed > 14 ? 17 : 13));
      body.position.y = 1.12 + (running && !airborne ? Math.abs(stride) * .09 : 0);
      body.rotation.set(-.08, 0, -steer * .1);
      head.rotation.y = -steer * .1;
      for (let i = 0; i < 2; i++) {
        const swing = (i === 0 ? stride : -stride) * (running ? .82 : 0);
        hips[i].rotation.x = airborne ? (i ? .35 : -.8) : swing;
        knees[i].rotation.x = airborne ? .95 : Math.max(0, -swing) * 1.1;
        arms[i].rotation.x = airborne ? -1.8 : -swing * .9;
        arms[i].rotation.z = i ? -.13 : .13;
        elbows[i].rotation.x = -1;
      }
    },
  };
}
