import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, CheckSquare, Mic, Code, Sun, Moon } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(email, password);
      toast.success("Successfully logged in!");
      navigate("/");
    } catch (err) {
      toast.error("Invalid login credentials");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-app-bg px-4 overflow-hidden">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-6 right-6 z-50 p-3 rounded-xl bg-app-surface/80 backdrop-blur-md shadow-lg border border-app-border hover:bg-app-muted transition-all duration-300 hover:scale-110"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5 text-app-accent" />
        ) : (
          <Moon className="w-5 h-5 text-app-primary" />
        )}
      </button>

      {/* Enhanced animated background */}
      <div className="pointer-events-none absolute -top-20 -left-20 w-96 h-96 rounded-full bg-app-primary/10 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-app-accent/10 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="pointer-events-none absolute bottom-20 left-1/4 w-72 h-72 rounded-full bg-app-primary/20 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      <div className="rounded-3xl overflow-hidden flex w-full max-w-[1000px] bg-app-surface/80 backdrop-blur-sm shadow-2xl min-h-[600px] border border-app-border">
        {/* Left Panel */}
        <div className="hidden md:flex flex-col items-center justify-center w-1/2 p-12 text-center relative bg-app-muted">
          <div className="w-full max-w-xl mb-8">
            <DotLottieReact 
              src="https://lottie.host/1add37dc-5e37-495d-b85c-cc2104b7f27e/CBdY1kiUmx.lottie" 
              loop 
              autoplay 
              style={{ width: "400px", height: "300px" }} 
            />
          </div>
          
          <div className="space-y-4">
  <h1 className="text-4xl font-bold text-app-primary">
    Exam Portal
  </h1>
  <p className="text-lg text-app-text opacity-80 leading-relaxed">
    Welcome to our comprehensive examination platform. Take your assessments with confidence and track your progress.
  </p>

  <div className="flex items-center justify-center space-x-6 mt-8">
    {/* You can add buttons or links here */}
  </div>
</div>

        </div>

        {/* Right Panel - Enhanced Login Form */}
        <div className="w-full md:w-1/2 p-12 bg-app-surface/90 backdrop-blur-sm flex flex-col justify-center">
          <div className="max-w-sm mx-auto w-full">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-app-text mb-2">Welcome Back</h2>
              <p className="text-app-text opacity-70">Sign in to continue your exam journey</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-app-text">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-app-text opacity-40 w-5 h-5" />
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-app-muted border border-app-border text-app-text focus:outline-none focus:ring-2 focus:ring-app-primary focus:border-transparent transition-all duration-300"
                  />
                </div>
              </div>

            {/* Password Field */}
<div className="space-y-2">
  <label className="text-sm font-semibold text-app-text">Password</label>
  <div className="relative">
    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 
      text-app-text opacity-50 w-5 h-5" />
    <input
      type="password"
      placeholder="Enter your password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
      className="w-full pl-12 pr-4 py-4 rounded-xl 
        bg-white dark:bg-slate-800 
        border border-slate-300 dark:border-slate-600 
        text-slate-800 dark:text-slate-100 
        placeholder-slate-400 dark:placeholder-slate-500
        focus:outline-none focus:ring-2 focus:ring-indigo-500 
        focus:border-transparent transition-all duration-300"
    />
  </div>
</div>

{/* Submit Button */}
<button
  type="submit"
  disabled={isLoading}
  className={`w-full py-4 rounded-xl font-semibold text-white 
    transition-all duration-300 transform ${
      isLoading
        ? "bg-gray-400 cursor-not-allowed"
        : "bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02] hover:shadow-lg"
    }`}
>
  {isLoading ? (
    <div className="flex items-center justify-center space-x-2 text-white">
      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      <span className="font-medium">Logging in...</span>
    </div>
  ) : (
    "LOG IN"
  )}
</button>


            </form>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-app-text opacity-60">
                Need help? Contact your administrator
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
