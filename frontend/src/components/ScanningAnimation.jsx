const ScanningAnimation = ({ message = 'Cross-Referencing Official Rules...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <div className="relative w-32 h-32">
        {/* Outer Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 border-r-indigo-500 animate-spin"></div>
        {/* Middle Ring */}
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-l-cyan-400 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        {/* Inner Ring */}
        <div className="absolute inset-4 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" style={{ animationDuration: '0.75s' }}></div>
        {/* Center icon or dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 bg-white rounded-full animate-pulse shadow-[0_0_15px_rgba(255,255,255,0.8)]"></div>
        </div>
      </div>
      <h3 className="text-xl font-medium tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 animate-pulse">
        {message}
      </h3>
    </div>
  );
};

export default ScanningAnimation;
