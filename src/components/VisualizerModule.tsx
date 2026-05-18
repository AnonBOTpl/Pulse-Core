export const VisualizerModule = () => {
  return (
    <div className="bento-module visualizer-module">
      <div className="visualizer-container">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="vis-bar"
            style={{
              animationDelay: `${i * 0.05}s`,
              height: `${20 + Math.random() * 60}%`
            }}
          ></div>
        ))}
      </div>
      <p className="module-label">SPECTRUM ANALYZER</p>
    </div>
  );
};
