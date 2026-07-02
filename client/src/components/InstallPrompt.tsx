import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Show prompt after 3 seconds
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 md:hidden"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/30">
                A
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Install App</h3>
                <p className="text-xs text-gray-500">Add to Home Screen for the best experience</p>
              </div>
            </div>
            <button 
              onClick={() => setShowPrompt(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {isIOS ? (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-white rounded flex items-center justify-center shadow-sm">
                  <Share className="w-4 h-4 text-blue-500" />
                </span>
                <span>Tap the <strong>Share</strong> button</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-white rounded flex items-center justify-center shadow-sm">
                  <PlusSquare className="w-4 h-4 text-gray-600" />
                </span>
                <span>Select <strong>Add to Home Screen</strong></span>
              </div>
            </div>
          ) : (
            <Button className="w-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              Install Now
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
