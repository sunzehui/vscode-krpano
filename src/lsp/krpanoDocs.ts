// 手写的 krpano 元素/属性说明(英文,供 hover 与补全使用)。
// 只描述用途,不复用 krpano 官方文档原文;属性名与元素名的完整清单在 krpanoData.json。
export const elementDocs: Record<string, string> = {
  krpano: 'Root element of a krpano XML file. All other XML elements must be defined inside it.',
  include: 'Includes another XML file at this position. Attributes of the target root element can be overridden.',
  preview: 'Low-resolution preview image, displayed while the full panorama is loading.',
  image: 'Panorama image definition. The type attribute selects cube, cubestrip, sphere, cylinder, flat or fisheye; its child element describes the image source.',
  cube: 'Cube panorama: a single image per cube side, or a multiresolution tile set.',
  cubestrip: 'Single panoramic strip image containing all cube sides (order set by striporder).',
  level: 'One resolution level of a multiresolution image.',
  sphere: 'Spherical (equirectangular) panorama image.',
  cylinder: 'Cylindrical panorama image.',
  flat: 'Flat / non-panoramic image.',
  fisheye: 'Fisheye panorama image.',
  depthmap: 'Depth map data for 3D model or depth-map based viewing.',
  view: 'Camera and view settings (fov, limits, distortion, stereo).',
  area: 'Position and size of the viewer area.',
  display: 'Global display and rendering settings (quality, fps, stereo, hardware scaling).',
  control: 'User input settings (mouse, touch, keyboard, drag behaviour).',
  cursors: 'Custom cursor images.',
  autorotate: 'Automatic camera rotation settings.',
  contextmenu: 'Context menu entries and behaviour.',
  textstyle: 'Named text styles used by text displaying elements (defines arbitrary name="..." styles).',
  cssstyles: 'Named CSS styles for HTML elements in text or layers (defines arbitrary name="..." styles).',
  events: 'Global event handlers (onstart, onloadcomplete, onnewscene, custom named events).',
  action: 'A named (or autorun) action containing krpano script or JavaScript code.',
  data: 'Arbitrary data stored in the XML, accessible from actions via the data[...] array.',
  hotspot: 'A hotspot inside the panorama (image, point, polygon or 3D model).',
  layer: 'A 2D screen layer element (image, text, container or HTML).',
  plugin: 'Legacy alias of the layer element (kept for older panos).',
  style: 'Named style: attributes defined here are copied to elements that reference it via the style attribute.',
  scene: 'A scene of a virtual tour. Scenes are loaded one at a time by loadscene().',
  model: '3D model (for example an OBJ file) placed in the panorama.',
  splats: 'Gaussian splatting data.',
}

// 常见属性说明;元素专属属性会回退到这里,再回退到通用文案。
export const attributeDocs: Record<string, string> = {
  name: 'Name of the element. Names are referenced by actions and events.',
  id: 'Alternative identifier of the element (legacy).',
  url: 'Path or URL of the file to load.',
  type: 'Type of the element or of its content.',
  content: 'Inline content, alternative to loading from a url.',
  style: 'Name of a style whose attributes are applied to this element.',
  keep: 'Keep this element (even when it would be removed automatically, e.g. after a scene load).',
  devices: 'Special attribute: the element is only used on the listed devices (e.g. mobile, tablet, desktop).',
  if: 'Special attribute: the element is only used when the expression evaluates to true.',
  enabled: 'Enables or disables the element (and its interaction).',
  visible: 'Shows or hides the element.',
  alpha: 'Transparency: 1.0 fully opaque, 0.0 fully transparent.',
  x: 'Horizontal position in pixels, relative to the area set by align.',
  y: 'Vertical position in pixels, relative to the area set by align.',
  zorder: 'Stacking order for layers, hotspots and plugins (higher values are in front).',
  align: 'Alignment / reference point (e.g. lefttop, center, bottomright, or layer[style]).',
  edge: 'Preferred edge to keep the element inside the viewer area.',
  width: 'Width of the element in pixels (or percentage).',
  height: 'Height of the element in pixels (or percentage).',
  scale: 'Scaling factor of the element.',
  rotate: 'Rotation in degrees.',
  bgcolor: 'Background color (0xRRGGBB).',
  bgalpha: 'Background transparency.',
  ath: 'Horizontal position of a hotspot in degrees (-180 .. +180).',
  atv: 'Vertical position of a hotspot in degrees (-90 .. +90).',
  onclick: 'Action or event code that runs when the element is clicked.',
  onloaded: 'Action or event code that runs when the element has been loaded.',
  onover: 'Action or event code that runs when the pointer moves over the element.',
  onout: 'Action or event code that runs when the pointer moves out of the element.',
  ondown: 'Action or event code that runs when the mouse button / touch is pressed on the element.',
  onup: 'Action or event code that runs when the mouse button / touch is released on the element.',
  onhover: 'Action or event code that runs when the element is hovered.',
  onstart: 'Action or event code that runs at this point (e.g. after the pano has started).',
  onloadcomplete: 'Action or event code that runs when the panorama is fully loaded.',
  onnewscene: 'Action or event code that runs when a new scene is loaded.',
  onenterfullscreen: 'Action or event code that runs when fullscreen is entered.',
  onexitfullscreen: 'Action or event code that runs when fullscreen is exited.',
  onkeydown: 'Action or event code that runs on key down.',
  onkeyup: 'Action or event code that runs on key up.',
  onresize: 'Action or event code that runs when the viewer is resized.',
  onidle: 'Action or event code that runs when the viewer is idle.',
  oninterrupt: 'Action or event code that runs when the current movement is interrupted.',
  args: 'Names of the arguments passed to the action (comma separated).',
  scope: 'Variable scope of the action code: global, local or parent.',
  autorun: 'Run the action automatically: preinit (before the pano is built) or onstart (after).',
  usestrictjs: 'Enable or disable the JavaScript strict mode for this action.',
  protect: 'Protect the action code (obfuscate it when using protected viewing).',
  secure: 'Restrict the action code to the same domain.',
  version: 'Required krpano version of the file.',
  basedir: 'Base directory used to resolve all relative paths of this file.',
  language: 'Language of the pano (used by the [get(...)] text system).',
  hlookat: 'Horizontal look direction of the default view in degrees.',
  vlookat: 'Vertical look direction of the default view in degrees.',
  camroll: 'Roll of the camera in degrees.',
  fov: 'Field of view (zoom) of the camera in degrees.',
  fovmin: 'Minimum field of view (maximal zoom in).',
  fovmax: 'Maximum field of view (maximal zoom out).',
  fovtype: 'Interpretation of the fov value: MFOV, HFOV, VFOV, DFOV, SFOV.',
  tiledimagewidth: 'Total pixel width of a multiresolution image (tiled).',
  tiledimageheight: 'Total pixel height of a multiresolution image (tiled).',
  tilesize: 'Size of a single tile in pixels.',
  multires: 'Use multiresolution (tiled) images instead of a single image.',
  crop: 'Cropping rectangle of an image: x|y|width|height.',
  frame: 'Frame index of an image-strip / sprite sheet.',
  frames: 'Total number of frames of an image-strip / sprite sheet.',
  alpha_hittest: 'Use the image alpha channel for hit testing (pixel-perfect hotspots).',
  hittest: 'Defines whether the element can be clicked / catches the mouse / touch.',
  handcursor: 'Show the hand cursor when hovering the element.',
  capture: 'Capture all mouse / touch events of the element.',
  group: 'Elements with the same group name are handled exclusively (like radio buttons).',
  linkedscene: 'Scene to load when the element is clicked (tour hotspots).',
  target: 'Target element for movements or look-at actions.',
}

export function docForElement(name: string, attributeCount: number): string {
  const doc = elementDocs[name]
  const lines: string[] = []
  if (doc)
    lines.push(doc)
  else
    lines.push('krpano XML element.')
  lines.push('', `${attributeCount} attributes known.`)
  return lines.join('\n')
}

export function docForAttribute(element: string, attribute: string): string {
  const specific = attributeDocs[`${element}.${attribute}`]
  if (specific)
    return specific
  if (attributeDocs[attribute])
    return attributeDocs[attribute]
  return 'krpano attribute (no description available).'
}
