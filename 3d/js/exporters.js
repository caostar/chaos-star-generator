// 3D export: STL (binary), GLB, OBJ, 3MF.

import * as THREE from 'three';
import { STLExporter }  from 'three/addons/exporters/STLExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter }  from 'three/addons/exporters/OBJExporter.js';
import { zipSync, strToU8 } from 'fflate';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportSphere(format, state) {
  const mesh = state.mesh;
  if (!mesh) throw new Error('Nothing to export yet');

  if (format === 'stl') {
    const stl = new STLExporter().parse(mesh, { binary: true });
    download(new Blob([stl], { type: 'model/stl' }), 'chaos-sphere.stl');
    return;
  }
  if (format === 'obj') {
    const obj = new OBJExporter().parse(mesh);
    download(new Blob([obj], { type: 'text/plain' }), 'chaos-sphere.obj');
    return;
  }
  if (format === 'glb') {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(mesh, resolve, reject, { binary: true });
    });
    download(new Blob([gltf], { type: 'model/gltf-binary' }), 'chaos-sphere.glb');
    return;
  }
  if (format === '3mf') {
    download(buildThreeMF(mesh), 'chaos-sphere.3mf');
    return;
  }
  throw new Error(`Unknown format: ${format}`);
}

// Hand-rolled 3MF writer. 3MF is a zip of XML; for a single mesh + single
// material this fits in ~100 lines without needing a full library.
function buildThreeMF(mesh) {
  const geom = mesh.geometry;
  const posAttr = geom.attributes.position;
  const idxAttr = geom.index;

  const verts = [];
  for (let i = 0; i < posAttr.count; i++) {
    verts.push(`<vertex x="${posAttr.getX(i).toFixed(4)}" y="${posAttr.getY(i).toFixed(4)}" z="${posAttr.getZ(i).toFixed(4)}"/>`);
  }
  const tris = [];
  if (idxAttr) {
    for (let i = 0; i < idxAttr.count; i += 3) {
      tris.push(`<triangle v1="${idxAttr.getX(i)}" v2="${idxAttr.getX(i+1)}" v3="${idxAttr.getX(i+2)}"/>`);
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      tris.push(`<triangle v1="${i}" v2="${i+1}" v3="${i+2}"/>`);
    }
  }

  const colorHex = (mesh.material?.color
    ? '#' + mesh.material.color.getHexString().toUpperCase()
    : '#4FC3F7') + 'FF';

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">Chaos Sphere</metadata>
  <metadata name="Application">Chaos Sphere Generator</metadata>
  <resources>
    <m:colorgroup id="1">
      <m:color color="${colorHex}"/>
    </m:colorgroup>
    <object id="2" type="model" pid="1" pindex="0">
      <mesh>
        <vertices>${verts.join('')}</vertices>
        <triangles>${tris.join('')}</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="2"/>
  </build>
</model>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Target="/3D/3dmodel.model"
                Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels':         strToU8(rels),
    '3D/3dmodel.model':    strToU8(model),
  });
  return new Blob([zip], { type: 'model/3mf' });
}
