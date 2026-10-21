import * as T from 'three';
const cold = new T.Color(0x69dfff), heat = new T.Color(0xff490b);
/** Recompose from the original color every frame; neither status restores over the other. */
export function applyStatusMaterial(material: T.MeshStandardMaterial, base: T.Color, burn: number, frost: boolean, pulse = 0): void {
    material.color.copy(base).lerp(cold, frost ? .35 : 0);
    material.emissive.setRGB(0, 0, 0);
    if (burn > 0) material.emissive.setRGB(heat.r * burn * (1 + pulse), heat.g * burn * (1 + pulse), heat.b * burn * (1 + pulse));
    if (frost) material.emissive.setRGB(material.emissive.r + cold.r * .18, material.emissive.g + cold.g * .18, material.emissive.b + cold.b * .18);
    material.emissiveIntensity = 1;
}
