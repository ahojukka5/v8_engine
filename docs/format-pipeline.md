# Proposed CAD, mesh, and web visualization pipeline

The exact CAD model, numerical mesh, and browser visualization have different requirements. The robust architecture is therefore a **linked multi-representation pipeline**, not a single universal file.

## Recommended representation stack

| Stage | Canonical representation | Purpose |
|---|---|---|
| Authoring / exchange | STEP AP242 | Exact trimmed surfaces, solids, assembly tree, names and colors |
| Monge.jl internal | Topological B-rep + parametric/semantic graph | Exact geometry operations, constraints, diagnostics and revision history |
| Delone.jl input | Healed B-rep plus mesh-size/feature metadata | Boundary-conforming surface and volume meshing |
| Simulation mesh | Gmsh MSH 4.1 or VTK XML | Cells, facets, physical groups, partitioning and result fields |
| Browser delivery | glTF/GLB for CAD tessellation; VTK XML or custom binary for fields | Efficient GPU rendering and interaction |
| Huge scenes | 3D Tiles | Spatial hierarchy, streaming and level of detail |

## Why STEP AP242 is the default CAD hand-off

STEP is a true CAD exchange format rather than a triangle format. AP242 can retain assembly/product structure and presentation information in addition to exact geometric/topological entities. Monge.jl should import the assembly as semantic components rather than flattening everything into one shape.

The importer should preserve at least:

- source document and entity identifiers;
- assembly instance path;
- component and body names;
- colors and layers;
- units and coordinate systems;
- solid/shell/face/edge topology;
- analytic surface types where available;
- uncertainty/tolerance information;
- explicit user attributes and PMI when supported.

## Web representation

### glTF / GLB

Use glTF for display tessellations. A GLB can contain geometry, normals, UVs, PBR materials, hierarchy, cameras and animation in one compact binary asset. It is not the geometry to remesh; it is a view representation generated from the exact model.

Recommended glTF node extras:

```json
{
  "monge_id": "body:7f4c...",
  "revision": "r19",
  "assembly_path": "/engine/bank-left/head",
  "source_shape": "STEP:#18342",
  "semantic_type": "cylinder_head",
  "boundary_ids": [42, 43, 44],
  "lod": 0
}
```

These identifiers let a selection in Three.js map back to exact Monge.jl topology or Delone.jl entities.

### VTK.js and mesh results

VTK.js is a stronger fit than Three.js when the primary object is a scientific dataset: volume cells, point/cell arrays, cutting planes, contours, streamlines, glyphs or time-dependent fields. Prefer VTK XML datasets:

- `.vtp` for polygonal surface data;
- `.vtu` for unstructured volume meshes;
- `.vtm` for multiblock assemblies;
- `.pvd` or a manifest for time series.

For a polished application, use Three.js for CAD/assembly presentation and VTK.js for simulation-specific views, with a shared camera and selection model where practical.

## Documentation extension concept

A reusable documentation component could be embedded in Quarto/Documenter pages as:

```html
<monge-viewer
  geometry="assets/engine.glb"
  mesh="assets/engine.vtu"
  mode="cad+mesh"
  camera="isometric"
  selection="semantic"
></monge-viewer>
```

The custom element would:

1. create an isolated canvas and renderer;
2. load glTF and/or VTK data;
3. read a small JSON manifest describing ids, units, fields and revisions;
4. provide orbit, clipping, explode, visibility and scalar-field controls;
5. expose selection events to the hosting documentation page;
6. optionally render a deterministic PNG fallback for GitHub README and PDF output.

A Quarto extension can inject the JavaScript/CSS once per page. Documenter.jl can use the same web component as an asset. This avoids maintaining separate viewers for each documentation system.

## GitHub limitation

GitHub Markdown sanitizes scripts and does not execute arbitrary Three.js or VTK.js code inside a README. Direct repository rendering therefore has two layers:

- a static screenshot/GIF or GitHub-native STL preview in the README;
- the complete interactive application on GitHub Pages, linked from the README.

The source can still live entirely in the repository, and branch-based Pages can publish the existing `docs/` directory without a build step.

## Suggested Monge.jl / Delone.jl export contract

```text
model.step                 exact neutral CAD
model.monge.json           semantic ids, revisions, constraints, diagnostics
model.glb                  tessellated web view with stable ids
mesh.msh                   authoritative numerical mesh
mesh.vtu                   browser/scientific visualization dataset
scene.json                 ties all representations and coordinate systems together
thumbnail.webp             deterministic fallback for GitHub and PDFs
```

The key invariant is stable semantic identity across all representations. A face selected in the browser should resolve to the exact B-rep face, the derived surface triangles, boundary mesh facets and attached simulation results.
