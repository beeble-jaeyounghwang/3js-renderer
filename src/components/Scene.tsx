import { useEffect, useState, useRef, useCallback, createContext, useContext } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { RefreshCw, Camera, Move, Lightbulb, RotateCw, Square, Layers, PaintBucket, Circle, Droplet, Mountain } from 'lucide-react';

// Define all possible view modes
type ViewMode = 'standard' | 'normal' | 'basecolor' | 'metallic' | 'roughness' | 'depth';

// Create a context to share the view mode state
const ViewModeContext = createContext<ViewMode>('standard');

// Hook to use the view mode context
const useViewMode = () => useContext(ViewModeContext);

// Primitive types we'll randomly choose from
type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';

// Properties for each primitive geometry
interface GeometryProps {
  type: PrimitiveType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  id: string; // Add unique ID for each geometry
  roughness?: number;
  metalness?: number;
}

// Animation presets
type AnimationPreset = 
  | null 
  | 'orbit-camera' 
  | 'oscillate-camera' 
  | 'rotate-light' 
  | 'rotate-objects' 
  | 'translate-objects';

// Check if two objects collide based on their bounding spheres
const checkCollision = (pos1: [number, number, number], scale1: [number, number, number], 
                         pos2: [number, number, number], scale2: [number, number, number]) => {
  // Get the maximum radius for each object (approximating with the largest scale dimension)
  const radius1 = Math.max(...scale1) / 2;
  const radius2 = Math.max(...scale2) / 2;
  
  // Calculate distance between centers
  const dx = pos1[0] - pos2[0];
  const dz = pos1[2] - pos2[2]; // We only care about x and z for ground plane collision
  const distance = Math.sqrt(dx * dx + dz * dz);
  
  // Add a small buffer to prevent objects from being too close
  const minDistance = radius1 + radius2 + 0.5;
  
  return distance < minDistance;
};

// Generate random primitive geometries
const generateRandomGeometries = (count: number): GeometryProps[] => {
  const types: PrimitiveType[] = ['box', 'sphere', 'cylinder', 'cone', 'torus'];
  const geometries: GeometryProps[] = [];
  const planeSize = 10; // Size of our ground plane
  const maxAttempts = 100; // Prevent infinite loops if placement is impossible
  
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let isColliding = true;
    let newGeometry: GeometryProps | null = null;
    
    while (isColliding && attempts < maxAttempts) {
      // Random type
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Random size with different x, y, z scales
      const baseSize = 0.5 + Math.random() * 1.0;
      const scale: [number, number, number] = [
        baseSize * (0.7 + Math.random() * 0.6), // x: 70% to 130% of base size 
        baseSize * (0.7 + Math.random() * 0.6), // y: 70% to 130% of base size
        baseSize * (0.7 + Math.random() * 0.6)  // z: 70% to 130% of base size
      ];
      
      // Random position within plane bounds
      const halfPlaneSize = planeSize / 2 - Math.max(...scale) / 2;
      const position: [number, number, number] = [
        (Math.random() * 2 - 1) * halfPlaneSize, // x: -halfPlaneSize to halfPlaneSize
        scale[1] / 2, // y: half height (to sit on ground)
        (Math.random() * 2 - 1) * halfPlaneSize // z: -halfPlaneSize to halfPlaneSize
      ];
      
      // Random rotation
      const rotation: [number, number, number] = [0, Math.random() * Math.PI * 2, 0];
      
      // Random color
      const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
      
      // Random material properties
      const roughness = Math.random();
      const metalness = Math.random();
      
      // Add unique ID
      const id = `geo-${i}-${Math.random().toString(36).substring(2, 9)}`;
      
      newGeometry = { 
        type, 
        position, 
        rotation, 
        scale, 
        color, 
        id, 
        roughness, 
        metalness 
      };
      
      // Check for collisions with existing geometries
      isColliding = geometries.some(existing => 
        checkCollision(existing.position, existing.scale, position, scale)
      );
      
      attempts++;
    }
    
    if (newGeometry && !isColliding) {
      geometries.push(newGeometry);
    } else {
      console.warn(`Couldn't place geometry ${i} after ${maxAttempts} attempts`);
    }
  }
  
  return geometries;
};

// Component for a single primitive
const Primitive = ({ type, position, rotation, scale, color, id, roughness = 0.5, metalness = 0.1 }: GeometryProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const viewMode = useViewMode();
  
  // Different geometry based on the type
  const renderGeometry = () => {
    switch (type) {
      case 'box':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.2, 16, 100]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };
  
  // Create a Three.js array from position, rotation and scale
  const threePosition = new THREE.Vector3(...position);
  const threeRotation = new THREE.Euler(...rotation);
  const threeScale = new THREE.Vector3(...scale);
  
  // Render material based on view mode
  const renderMaterial = () => {
    switch (viewMode) {
      case 'normal':
        return <meshNormalMaterial />;
        
      case 'basecolor':
        return <meshBasicMaterial color={color} />;
        
      case 'metallic':
        // Show metalness as a grayscale value
        const metallicColor = new THREE.Color(metalness, metalness, metalness);
        return <meshBasicMaterial color={metallicColor} />;
        
      case 'roughness':
        // Show roughness as a grayscale value
        const roughnessColor = new THREE.Color(roughness, roughness, roughness);
        return <meshBasicMaterial color={roughnessColor} />;
        
      case 'depth':
        // Show depth from camera
        return <meshDepthMaterial />;
        
      case 'standard':
      default:
        return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
    }
  };
  
  return (
    <mesh 
      ref={meshRef}
      position={threePosition}
      rotation={threeRotation}
      scale={threeScale}
      castShadow
      receiveShadow
    >
      {renderGeometry()}
      {renderMaterial()}
    </mesh>
  );
};

// Component for the ground plane
const Ground = () => {
  const viewMode = useViewMode();
  
  // Render material based on view mode
  const renderMaterial = () => {
    switch (viewMode) {
      case 'normal':
        return <meshNormalMaterial />;
        
      case 'basecolor':
        return <meshBasicMaterial color="#f0f0f0" />;
        
      case 'metallic':
        // Ground is non-metallic (0)
        return <meshBasicMaterial color={new THREE.Color(0, 0, 0)} />;
        
      case 'roughness':
        // Ground is rough (1)
        return <meshBasicMaterial color={new THREE.Color(1, 1, 1)} />;
        
      case 'depth':
        // Show depth from camera
        return <meshDepthMaterial />;
        
      case 'standard':
      default:
        return <meshStandardMaterial color="#f0f0f0" roughness={1} metalness={0} />;
    }
  };
  
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      {renderMaterial()}
    </mesh>
  );
};

// Animation controller component that handles all animations
const AnimationController = ({ 
  activePreset, 
  geometries, 
  setGeometries,
  lightRef
}: { 
  activePreset: AnimationPreset, 
  geometries: GeometryProps[], 
  setGeometries: React.Dispatch<React.SetStateAction<GeometryProps[]>>,
  lightRef: React.RefObject<THREE.DirectionalLight>
}) => {
  const { camera } = useThree();
  const orbitControlsRef = useRef<any>(null);
  const initialCameraPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 5, 10));
  const initialLightPos = useRef<THREE.Vector3>(new THREE.Vector3(10, 10, 5));
  const time = useRef(0);
  const initialGeometriesRef = useRef<GeometryProps[]>([]);
  
  // Store initial positions on first render
  useEffect(() => {
    if (camera && camera.position) {
      initialCameraPos.current = camera.position.clone();
    }
    
    if (lightRef.current) {
      initialLightPos.current = lightRef.current.position.clone();
    }
    
    // Deep copy the geometries for reference
    initialGeometriesRef.current = JSON.parse(JSON.stringify(geometries));
  }, [camera, geometries, lightRef]);
  
  // Reset positions when changing presets
  useEffect(() => {
    if (!activePreset) {
      // Reset camera position
      if (camera && camera.position) {
        camera.position.copy(initialCameraPos.current);
        camera.lookAt(0, 0, 0);
      }
      
      // Reset light position
      if (lightRef.current) {
        lightRef.current.position.copy(initialLightPos.current);
      }
      
      // Reset object positions
      setGeometries(JSON.parse(JSON.stringify(initialGeometriesRef.current)));
      
      // Reset time
      time.current = 0;
    }
  }, [activePreset, camera, lightRef, setGeometries]);
  
  // Animation frame loop
  useFrame((_, delta) => {
    if (!activePreset) return;
    
    time.current += delta;
    
    switch (activePreset) {
      case 'orbit-camera':
        // 360-degree camera orbit
        const radius = 10;
        const speed = 0.5;
        const angle = time.current * speed;
        
        if (camera) {
          const x = Math.sin(angle) * radius;
          const z = Math.cos(angle) * radius;
          camera.position.set(x, 5, z);
          camera.lookAt(0, 0, 0);
          
          // Disable orbit controls during animation
          if (orbitControlsRef.current) {
            orbitControlsRef.current.enabled = false;
          }
        }
        break;
        
      case 'oscillate-camera': 
        // Small-scale camera oscillation
        if (camera) {
          const oscSize = 2;
          const oscSpeed = 2;
          const x = initialCameraPos.current.x + Math.sin(time.current * oscSpeed) * oscSize;
          const z = initialCameraPos.current.z + Math.cos(time.current * oscSpeed) * oscSize;
          camera.position.set(x, initialCameraPos.current.y, z);
          camera.lookAt(0, 0, 0);
          
          // Disable orbit controls during animation
          if (orbitControlsRef.current) {
            orbitControlsRef.current.enabled = false;
          }
        }
        break;
        
      case 'rotate-light':
        // 360-degree rotating light with fixed camera
        if (lightRef.current) {
          const lightRadius = 15;
          const lightSpeed = 0.5;
          const lightAngle = time.current * lightSpeed;
          
          const x = Math.sin(lightAngle) * lightRadius;
          const z = Math.cos(lightAngle) * lightRadius;
          lightRef.current.position.set(x, 10, z);
          
          // Re-enable orbit controls
          if (orbitControlsRef.current) {
            orbitControlsRef.current.enabled = true;
          }
        }
        break;
        
      case 'rotate-objects':
        // Rotating objects with fixed camera
        if (initialGeometriesRef.current.length > 0) {
          // Create a new array with new object references to force React to update
          const rotatedGeometries = geometries.map((geo, index) => {
            // Create a new geometry object by spreading the original
            const newGeo = { ...geo };
            
            // Rotate at different speeds based on index
            const rotationSpeed = 1.0 + (index * 0.3); // Make rotation more pronounced
            newGeo.rotation = [
              geo.rotation[0],
              (time.current * rotationSpeed) % (Math.PI * 2),
              geo.rotation[2]
            ];
            
            return newGeo;
          });
          
          setGeometries(rotatedGeometries);
        }
        
        // Re-enable orbit controls
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = true;
        }
        break;
        
      case 'translate-objects':
        // Translating objects around the plane
        if (initialGeometriesRef.current.length > 0) {
          const planeSize = 9; // Slightly smaller than actual plane to keep objects on it
          
          // Create completely new objects to ensure React state updates
          const translatedGeometries = geometries.map((geo, index) => {
            // Start with original geometry properties
            const initialGeo = initialGeometriesRef.current[index];
            if (!initialGeo) return geo;
            
            // Create a new object to avoid reference issues
            const newGeo = { ...geo };
            
            // Each object moves in a different pattern
            const speed = 0.5 + (index * 0.2); // Faster speed
            const radius = 3 + (index * 0.7); // Larger radius for more noticeable movement
            const angle = time.current * speed;
            
            // Create circular motion with varying center points based on index
            const centerX = Math.sin(index) * 2;
            const centerZ = Math.cos(index) * 2;
            
            const x = centerX + Math.sin(angle) * radius;
            const z = centerZ + Math.cos(angle) * radius;
            
            // Clamp positions to stay within plane bounds
            newGeo.position = [
              Math.max(Math.min(x, planeSize/2), -planeSize/2),
              initialGeo.position[1], // Keep the original Y position to stay on the plane
              Math.max(Math.min(z, planeSize/2), -planeSize/2)
            ];
            
            return newGeo;
          });
          
          setGeometries(translatedGeometries);
        }
        
        // Re-enable orbit controls
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = true;
        }
        break;
    }
  });
  
  return <OrbitControls ref={orbitControlsRef} />;
};

// Scene content that uses the view mode context
const SceneContent = ({ 
  geometries, 
  setGeometries, 
  activePreset
}: {
  geometries: GeometryProps[],
  setGeometries: React.Dispatch<React.SetStateAction<GeometryProps[]>>,
  activePreset: AnimationPreset
}) => {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 10]} />
      
      {/* Use Animation Controller instead of static orbit controls */}
      <AnimationController 
        activePreset={activePreset} 
        geometries={geometries} 
        setGeometries={setGeometries}
        lightRef={lightRef}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        ref={lightRef}
        position={[10, 10, 5]} 
        intensity={1} 
        castShadow 
        shadow-mapSize-width={2048} 
        shadow-mapSize-height={2048}
      />
      
      {/* Environment */}
      <Ground />
      
      {/* Primitives */}
      {geometries.map((props) => (
        <Primitive key={props.id} {...props} />
      ))}
    </>
  );
};

// Component for a single UI panel
const Panel = ({ title, children, position }: { title: string, children: React.ReactNode, position: 'left' | 'right' }) => {
  return (
    <div className={`absolute top-4 ${position === 'left' ? 'left-4' : 'right-4'} z-10 bg-black/60 p-4 rounded-lg shadow-lg backdrop-blur-sm w-64`}>
      <h2 className="text-white font-bold text-lg mb-4 border-b border-white/30 pb-2">
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );
};

// Main scene component
const Scene = () => {
  const [geometries, setGeometries] = useState<GeometryProps[]>([]);
  const [activePreset, setActivePreset] = useState<AnimationPreset>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  
  const regenerateGeometries = useCallback(() => {
    const randomGeometries = generateRandomGeometries(5);
    setGeometries(randomGeometries);
    // Reset animation preset when regenerating
    setActivePreset(null);
  }, []);
  
  // Toggle animation preset
  const togglePreset = useCallback((preset: AnimationPreset) => {
    setActivePreset(prev => prev === preset ? null : preset);
  }, []);
  
  // Set view mode
  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);
  
  useEffect(() => {
    regenerateGeometries();
  }, [regenerateGeometries]);
  
  // Common button style function
  const getButtonClass = (isActive: boolean) => `
    flex items-center gap-2 px-4 py-2 rounded-md transition-colors w-full
    ${isActive 
      ? 'bg-blue-600 text-white shadow-md shadow-blue-700/50' 
      : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm'}
  `;
  
  return (
    <div className="w-full h-screen bg-gray-900 relative flex items-center justify-center">
      {/* Fixed size 3D viewport */}
      <div className="w-[1024px] h-[1024px] relative overflow-hidden border-2 border-white/10 rounded-lg shadow-2xl">
        <Canvas shadows>
          <ViewModeContext.Provider value={viewMode}>
            <SceneContent 
              geometries={geometries}
              setGeometries={setGeometries}
              activePreset={activePreset}
            />
          </ViewModeContext.Provider>
        </Canvas>
        
        {/* Regenerate button - now centered on top of the canvas */}
        <button 
          onClick={regenerateGeometries}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-full shadow-lg shadow-blue-900/50 flex items-center gap-2 transition-all"
        >
          <RefreshCw size={18} />
          Regenerate Scene
        </button>
      </div>
      
      {/* Left panel - Animation Presets */}
      <Panel title="Animation Presets" position="left">
        <button 
          onClick={() => togglePreset('orbit-camera')}
          className={getButtonClass(activePreset === 'orbit-camera')}
        >
          <Camera size={16} />
          <span>360° Camera Orbit</span>
        </button>
        
        <button 
          onClick={() => togglePreset('oscillate-camera')}
          className={getButtonClass(activePreset === 'oscillate-camera')}
        >
          <Move size={16} />
          <span>Camera Oscillation</span>
        </button>
        
        <button 
          onClick={() => togglePreset('rotate-light')}
          className={getButtonClass(activePreset === 'rotate-light')}
        >
          <Lightbulb size={16} />
          <span>360° Rotating Light</span>
        </button>
        
        <button 
          onClick={() => togglePreset('rotate-objects')}
          className={getButtonClass(activePreset === 'rotate-objects')}
        >
          <RotateCw size={16} />
          <span>Rotating Objects</span>
        </button>
        
        <button 
          onClick={() => togglePreset('translate-objects')}
          className={getButtonClass(activePreset === 'translate-objects')}
        >
          <Move size={16} />
          <span>Translating Objects</span>
        </button>
        
        <button 
          onClick={() => setActivePreset(null)}
          className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-md transition-colors w-full
            ${activePreset === null 
              ? 'bg-red-600 text-white shadow-md shadow-red-700/50' 
              : 'bg-red-500/20 hover:bg-red-500/30 text-white backdrop-blur-sm'}`}
        >
          <Square size={16} />
          <span>Stop Animation</span>
        </button>
      </Panel>
      
      {/* Right panel - View Modes */}
      <Panel title="Visualization Modes" position="right">
        <button 
          onClick={() => changeViewMode('standard')}
          className={getButtonClass(viewMode === 'standard')}
        >
          <Layers size={16} />
          <span>Standard View</span>
        </button>
        
        <button 
          onClick={() => changeViewMode('normal')}
          className={getButtonClass(viewMode === 'normal')}
        >
          <Layers size={16} />
          <span>Normal Map</span>
        </button>
        
        <button 
          onClick={() => changeViewMode('basecolor')}
          className={getButtonClass(viewMode === 'basecolor')}
        >
          <PaintBucket size={16} />
          <span>Base Color</span>
        </button>
        
        <button 
          onClick={() => changeViewMode('metallic')}
          className={getButtonClass(viewMode === 'metallic')}
        >
          <Circle size={16} />
          <span>Metallic</span>
        </button>
        
        <button 
          onClick={() => changeViewMode('roughness')}
          className={getButtonClass(viewMode === 'roughness')}
        >
          <Droplet size={16} />
          <span>Roughness</span>
        </button>
        
        <button 
          onClick={() => changeViewMode('depth')}
          className={getButtonClass(viewMode === 'depth')}
        >
          <Mountain size={16} />
          <span>Depth Map</span>
        </button>
      </Panel>
    </div>
  );
};

export default Scene;