import * as THREE from "three";
import { RunEffects, type FxShape } from "./run-effects";

const SHAPES: FxShape[] = ["smoke", "light", "star", "ring", "confetti", "streak"];
const TEXTURES: Partial<Record<FxShape, string>> = { smoke: "/vfx/smoke.png", light: "/vfx/light.png", star: "/vfx/star.png" };

/** Six instanced batches on WebGL; a capped geometry fallback for SVGRenderer. */
export class EffectsScene {
  readonly root = new THREE.Group();
  readonly model: RunEffects;
  private geometries = new Map<FxShape, THREE.BufferGeometry>();
  private batches = new Map<FxShape, THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>>();
  private simple: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private textures: THREE.Texture[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private normal = new THREE.Vector3();
  private disposed = false;
  constructor(private software = false, reducedMotion = false) {
    this.root.name = "run-effects";
    this.model = new RunEffects(software ? 80 : 192, Math.random, reducedMotion ? .45 : software ? .6 : 1);
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4, radius = i % 2 ? .14 : .5; if (!i) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); } star.closePath();
    for (const shape of SHAPES) {
      const geometry = shape === "ring" ? new THREE.RingGeometry(.89, 1, 32) : shape === "streak" ? new THREE.BoxGeometry(.12, .12, 2.8) : shape === "confetti" ? new THREE.PlaneGeometry(.6, 1) : software ? shape === "star" ? new THREE.ShapeGeometry(star) : new THREE.CircleGeometry(.5, 10) : new THREE.PlaneGeometry(1, 1);
      this.geometries.set(shape, geometry);
      if (!software) {
        geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(new Float32Array(this.model.capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("iOpacity", new THREE.InstancedBufferAttribute(new Float32Array(this.model.capacity), 1).setUsage(THREE.DynamicDrawUsage));
        const material = new THREE.ShaderMaterial({
          uniforms: { sprite: { value: null }, hasSprite: { value: false } },
          vertexShader: `attribute vec3 iColor; attribute float iOpacity; varying vec2 vUv; varying vec3 vColor; varying float vOpacity;
            void main(){ vUv=uv; vColor=iColor; vOpacity=iOpacity; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
          fragmentShader: `uniform sampler2D sprite; uniform bool hasSprite; varying vec2 vUv; varying vec3 vColor; varying float vOpacity;
            void main(){ vec4 tex=hasSprite?texture2D(sprite,vUv):vec4(1.0); float alpha=tex.a*vOpacity; if(alpha<0.005)discard;
              gl_FragColor=vec4(tex.rgb*vColor,alpha);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
          transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
          blending: shape === "smoke" || shape === "confetti" ? THREE.NormalBlending : THREE.AdditiveBlending,
        });
        const batch = new THREE.InstancedMesh(geometry, material, this.model.capacity); batch.count = 0; batch.frustumCulled = false;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.batches.set(shape, batch); this.root.add(batch);
        const source = TEXTURES[shape];
        if (source) {
          const texture = new THREE.TextureLoader().load(source, ready => {
            if (this.disposed) { ready.dispose(); return; }
            ready.colorSpace = THREE.SRGBColorSpace; material.uniforms.sprite.value = ready; material.uniforms.hasSprite.value = true;
          }, undefined, () => { /* Solid geometric particles still work offline. */ });
          this.textures.push(texture);
        }
      }
    }
    if (software) for (let i = 0; i < this.model.capacity; i++) {
      const mesh = new THREE.Mesh(this.geometries.get("light")!, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false; this.root.add(mesh); this.simple.push(mesh);
    }
  }
  render(camera: THREE.Camera) {
    const counts: Record<FxShape, number> = { smoke: 0, light: 0, star: 0, ring: 0, confetti: 0, streak: 0 };
    let simpleIndex = 0;
    for (const p of this.model.particles) {
      if (!p.active) continue;
      const progress = p.age / p.life, size = p.size + p.growth * p.age;
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.quaternion.copy(camera.quaternion); this.dummy.scale.setScalar(size);
      if (p.shape === "ring") {
        this.normal.set(p.nx, p.ny, p.nz); this.dummy.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.normal);
        this.dummy.rotateX(-Math.PI / 2);
      } else if (p.shape === "streak") {
        this.normal.set(p.vx, p.vy, p.vz).normalize(); this.dummy.quaternion.setFromUnitVectors(this.zAxis, this.normal);
      } else this.dummy.rotateZ(p.angle);
      if (p.shape === "confetti") this.dummy.scale.x *= .35 + Math.abs(Math.cos(p.angle)) * .65;
      const opacity = p.opacity * Math.min(1, (1 - progress) * (p.shape === "confetti" ? 4 : 1.6));
      this.color.setHex(p.color);
      if (this.software) {
        const mesh = this.simple[simpleIndex++]; mesh.visible = true; mesh.geometry = this.geometries.get(p.shape)!;
        mesh.position.copy(this.dummy.position); mesh.quaternion.copy(this.dummy.quaternion); mesh.scale.copy(this.dummy.scale);
        mesh.material.color.copy(this.color); mesh.material.opacity = opacity;
      } else {
        const batch = this.batches.get(p.shape)!, index = counts[p.shape]++;
        this.dummy.updateMatrix(); batch.setMatrixAt(index, this.dummy.matrix);
        (batch.geometry.getAttribute("iColor") as THREE.InstancedBufferAttribute).setXYZ(index, this.color.r, this.color.g, this.color.b);
        (batch.geometry.getAttribute("iOpacity") as THREE.InstancedBufferAttribute).setX(index, opacity);
      }
    }
    if (this.software) for (let i = simpleIndex; i < this.simple.length; i++) this.simple[i].visible = false;
    else for (const [shape, batch] of this.batches) {
      batch.count = counts[shape]; batch.instanceMatrix.needsUpdate = true;
      batch.geometry.getAttribute("iColor").needsUpdate = true; batch.geometry.getAttribute("iOpacity").needsUpdate = true;
    }
  }
  dispose() {
    this.disposed = true; this.root.removeFromParent(); this.model.clear();
    this.geometries.forEach(g => g.dispose()); this.textures.forEach(t => t.dispose());
    this.batches.forEach(b => { b.material.dispose(); b.dispose(); }); this.simple.forEach(m => m.material.dispose());
  }
}
