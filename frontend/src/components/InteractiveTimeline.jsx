import { useState } from 'react';

const InteractiveTimeline = ({ steps }) => {
  const [activeStep, setActiveStep] = useState(0);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="mt-8 w-full max-w-2xl mx-auto glass-panel overflow-hidden">
      <h3 className="text-xl font-bold mb-6 flex items-center">
        <span className="mr-2">📅</span> Official Process Timeline
      </h3>
      
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute left-[27px] top-4 bottom-8 w-1 bg-slate-700 rounded-full"></div>
        
        <div className="space-y-8 relative">
          {steps.map((step, index) => {
            const isActive = index <= activeStep;
            
            return (
              <div 
                key={index}
                className={`flex gap-6 cursor-pointer transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}
                onClick={() => setActiveStep(index)}
              >
                {/* Step Circle */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 z-10 transition-colors duration-300 shadow-lg shrink-0
                  ${isActive 
                    ? 'bg-indigo-600 border-indigo-400 text-white scale-110' 
                    : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                >
                  <span className="font-bold">{index + 1}</span>
                </div>
                
                {/* Step Content */}
                <div className={`flex-1 p-4 rounded-xl transition-all duration-300
                  ${isActive ? 'bg-slate-800/80 border border-slate-600 shadow-md' : 'hover:bg-slate-800/40'}`}
                >
                  <h4 className={`text-lg font-bold mb-1 ${isActive ? 'text-indigo-300' : 'text-slate-300'}`}>
                    {step.title}
                  </h4>
                  <p className="text-slate-300">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default InteractiveTimeline;
