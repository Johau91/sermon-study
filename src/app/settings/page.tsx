"use client";

import { useEffect, useState } from "react";
import { Check, Cpu, Loader2, RotateCcw, Settings, Sparkles } from "lucide-react";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

interface StylePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompt: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "pastor",
    name: "목사님 스타일",
    emoji: "\u26EA",
    description: "따뜻하고 친근한 설교체. 비유와 예화를 활용하여 이해하기 쉽게 전달합니다.",
    prompt: `답변 스타일:
- 설교하듯 이야기 방식으로 친근하고 따뜻하게 설명하세요.
- "여러분", "우리" 같은 표현을 자연스럽게 사용하세요.
- 딱딱한 나열 대신, 맥락을 풀어서 쉽게 이해할 수 있도록 이야기하세요.
- 비유와 예화를 활용하여 이해하기 쉽게 전달하세요.
- 마지막에 따뜻한 격려나 적용 포인트를 한 마디 덧붙이세요.`,
  },
  {
    id: "teacher",
    name: "선생님 스타일",
    emoji: "\uD83D\uDC69\u200D\uD83C\uDFEB",
    description: "친절한 선생님처럼 단계별로 차근차근 설명합니다. 핵심 포인트를 정리해줍니다.",
    prompt: `답변 스타일:
- 친절한 선생님처럼 차근차근 단계별로 설명하세요.
- 핵심 포인트를 명확히 정리해주세요.
- 어려운 개념은 쉬운 말로 바꿔서 설명하세요.
- "자, 그러면", "여기서 중요한 건" 같은 표현을 사용하세요.
- 마지막에 핵심 정리를 간단히 덧붙이세요.`,
  },
  {
    id: "professor",
    name: "교수님 스타일",
    emoji: "\uD83C\uDF93",
    description: "학술적이고 체계적인 분석. 신학적 맥락과 구조를 중심으로 설명합니다.",
    prompt: `답변 스타일:
- 학술적이고 체계적으로 분석하여 설명하세요.
- 구조화된 형식(번호, 소제목)을 활용하세요.
- 신학적 맥락과 배경을 포함하여 깊이 있게 설명하세요.
- 논리적 흐름을 중시하고 근거를 명확히 제시하세요.
- 결론에서 학문적 시사점이나 적용점을 정리하세요.`,
  },
  {
    id: "friend",
    name: "친구 스타일",
    emoji: "\uD83E\uDD1D",
    description: "편한 친구처럼 반말로 쉽고 캐주얼하게 설명합니다.",
    prompt: `답변 스타일:
- 편한 친구처럼 반말로 대화하세요.
- 쉽고 일상적인 표현을 사용하세요.
- "아 그거", "근데 말이야" 같은 구어체를 자연스럽게 사용하세요.
- 핵심만 간결하게 전달하세요.
- 딱딱한 형식 없이 자유롭게 이야기하세요.`,
  },
];

const DEFAULT_STYLE = "pastor";

export default function SettingsPage() {
  const [selectedStyle, setSelectedStyle] = useState(DEFAULT_STYLE);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("sermon-ai");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (data.ai_style) {
          setSelectedStyle(data.ai_style);
        }
        if (data.ai_custom_prompt) {
          setCustomPrompt(data.ai_custom_prompt);
        }
        if (data.ai_style === "custom") {
          setIsCustom(true);
        }
        if (data.ai_model) {
          setSelectedModel(data.ai_model);
        }
      } finally {
        setLoading(false);
      }
    }
    async function loadModels() {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error();
        const data: OllamaModel[] = await res.json();
        setModels(data);
      } catch {
        setModelsError("Ollama에 연결할 수 없습니다.");
      } finally {
        setModelsLoading(false);
      }
    }
    loadSettings();
    loadModels();
  }, []);

  const handleSelectStyle = (styleId: string) => {
    setSelectedStyle(styleId);
    setIsCustom(false);
    const preset = STYLE_PRESETS.find((p) => p.id === styleId);
    if (preset) {
      setCustomPrompt(preset.prompt);
    }
  };

  const handleCustomMode = () => {
    setIsCustom(true);
    setSelectedStyle("custom");
    if (!customPrompt) {
      const preset = STYLE_PRESETS.find((p) => p.id === DEFAULT_STYLE);
      setCustomPrompt(preset?.prompt || "");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await Promise.all([
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "ai_style", value: isCustom ? "custom" : selectedStyle }),
        }),
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "ai_custom_prompt", value: customPrompt }),
        }),
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "ai_model", value: selectedModel }),
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedStyle(DEFAULT_STYLE);
    setIsCustom(false);
    const preset = STYLE_PRESETS.find((p) => p.id === DEFAULT_STYLE);
    setCustomPrompt(preset?.prompt || "");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-[#3182F6]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900">
          설정
        </h1>
        <p className="mt-2 text-[15px] text-gray-500">
          AI 답변 스타일을 선택하거나 직접 프롬프트를 작성하세요.
        </p>
      </div>

      {/* Model Selection */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">AI 모델</h2>
        {modelsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <Loader2 className="size-4 animate-spin" />
            모델 목록 불러오는 중...
          </div>
        ) : modelsError ? (
          <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
            {modelsError}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {models.map((model) => {
              const isSelected = selectedModel === model.name;
              const sizeGB = (model.size / 1e9).toFixed(1);
              return (
                <button
                  key={model.name}
                  type="button"
                  onClick={() => setSelectedModel(model.name)}
                  className={`group relative rounded-2xl p-5 text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? "bg-[#3182F6]/5 ring-2 ring-[#3182F6] shadow-sm"
                      : "bg-white ring-1 ring-black/[0.04] shadow-sm hover:shadow-md hover:ring-[#3182F6]/20"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-[#3182F6]">
                      <Check className="size-3.5 text-white" />
                    </div>
                  )}
                  <Cpu className={`size-6 ${isSelected ? "text-[#3182F6]" : "text-gray-400"}`} />
                  <h3 className={`mt-3 text-[15px] font-bold ${isSelected ? "text-[#3182F6]" : "text-gray-900"}`}>
                    {model.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-500">
                    {sizeGB} GB
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Style Presets */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-gray-900">답변 스타일</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STYLE_PRESETS.map((preset) => {
            const isSelected = !isCustom && selectedStyle === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectStyle(preset.id)}
                className={`group relative rounded-2xl p-5 text-left transition-all active:scale-[0.98] ${
                  isSelected
                    ? "bg-[#3182F6]/5 ring-2 ring-[#3182F6] shadow-sm"
                    : "bg-white ring-1 ring-black/[0.04] shadow-sm hover:shadow-md hover:ring-[#3182F6]/20"
                }`}
              >
                {isSelected && (
                  <div className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-full bg-[#3182F6]">
                    <Check className="size-3.5 text-white" />
                  </div>
                )}
                <div className="text-2xl">{preset.emoji}</div>
                <h3 className={`mt-3 text-[15px] font-bold ${isSelected ? "text-[#3182F6]" : "text-gray-900"}`}>
                  {preset.name}
                </h3>
                <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Prompt */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">프롬프트 직접 수정</h2>
          <button
            type="button"
            onClick={handleCustomMode}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isCustom
                ? "bg-[#3182F6]/10 text-[#3182F6]"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            <Sparkles className="size-3" />
            커스텀 모드
          </button>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <p className="mb-3 text-xs text-gray-400">
            AI가 답변할 때 사용하는 스타일 지시문입니다. 프리셋을 선택하면 자동으로 채워지며, 자유롭게 수정할 수 있습니다.
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => {
              setCustomPrompt(e.target.value);
              if (!isCustom) {
                setIsCustom(true);
                setSelectedStyle("custom");
              }
            }}
            rows={8}
            placeholder="AI 답변 스타일 프롬프트를 입력하세요..."
            className="w-full resize-none rounded-xl bg-gray-50 p-4 text-[14px] leading-relaxed text-gray-700 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30 transition-all"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-[#3182F6] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] disabled:bg-gray-200 disabled:text-gray-400 active:scale-[0.97]"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saved ? (
            <Check className="size-4" />
          ) : (
            <Settings className="size-4" />
          )}
          {saving ? "저장 중..." : saved ? "저장 완료!" : "저장"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-gray-500 ring-1 ring-gray-200 transition-all hover:bg-gray-50 active:scale-[0.97]"
        >
          <RotateCcw className="size-4" />
          기본값으로
        </button>
      </div>
    </div>
  );
}
