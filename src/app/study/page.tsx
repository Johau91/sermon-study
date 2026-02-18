"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  GraduationCap,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  BookOpen,
  Trophy,
} from "lucide-react";

interface QuizQuestion {
  id?: number;
  question: string;
  expected_answer: string;
}

interface QuizResult {
  questionIndex: number;
  isCorrect: boolean;
  feedback: string;
  userAnswer: string;
  expectedAnswer: string;
}

type StudyPhase = "select" | "loading" | "quiz" | "results";

function StudyPageInner() {
  const searchParams = useSearchParams();
  const sermonId = searchParams.get("sermonId");

  const [phase, setPhase] = useState<StudyPhase>("select");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sermonTitle, setSermonTitle] = useState<string>("");

  // Generate quiz when sermonId is available
  const generateQuiz = useCallback(
    async (sid: string) => {
      try {
        setPhase("loading");
        setError(null);

        // Fetch sermon info
        const sermonRes = await fetch(`/api/sermons/${sid}`);
        if (sermonRes.ok) {
          const sermonData = await sermonRes.json();
          setSermonTitle(sermonData.title || `설교 #${sid}`);
        }

        const res = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sermonId: Number(sid), action: "generate" }),
        });

        if (!res.ok) {
          throw new Error("퀴즈를 생성할 수 없습니다.");
        }

        const data = await res.json();
        const quizQuestions: QuizQuestion[] = Array.isArray(data)
          ? data
          : data.questions || [];

        if (quizQuestions.length === 0) {
          throw new Error("퀴즈 문제를 만들 수 없습니다. 설교 내용을 확인해주세요.");
        }

        setQuestions(quizQuestions);
        setUserAnswers(new Array(quizQuestions.length).fill(""));
        setResults([]);
        setCurrentIndex(0);
        setCurrentAnswer("");
        setPhase("quiz");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "퀴즈 생성 중 오류가 발생했습니다."
        );
        setPhase("select");
      }
    },
    []
  );

  useEffect(() => {
    if (sermonId) {
      generateQuiz(sermonId);
    }
  }, [sermonId, generateQuiz]);

  const submitAnswer = async () => {
    if (!currentAnswer.trim() || submitting) return;

    setSubmitting(true);
    const currentQuestion = questions[currentIndex];

    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          sermonId: sermonId ? Number(sermonId) : null,
          question: currentQuestion.question,
          expectedAnswer: currentQuestion.expected_answer,
          userAnswer: currentAnswer.trim(),
          quizId: currentQuestion.id,
        }),
      });

      let feedback = "";
      let isCorrect = false;

      if (res.ok) {
        const data = await res.json();
        feedback = data.feedback || "답변이 제출되었습니다.";
        isCorrect = data.isCorrect ?? false;
      } else {
        feedback = "채점 중 오류가 발생했습니다. 답변은 기록되었습니다.";
      }

      const result: QuizResult = {
        questionIndex: currentIndex,
        isCorrect,
        feedback,
        userAnswer: currentAnswer.trim(),
        expectedAnswer: currentQuestion.expected_answer,
      };

      const newAnswers = [...userAnswers];
      newAnswers[currentIndex] = currentAnswer.trim();
      setUserAnswers(newAnswers);
      setResults((prev) => [...prev, result]);

      // Move to next question or results
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setCurrentAnswer("");
      } else {
        setPhase("results");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "답변 제출 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const correctCount = results.filter((r) => r.isCorrect).length;
  const scorePercent =
    results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  // Phase: Select Sermon
  if (phase === "select") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="size-7" />
            학습
          </h1>
          <p className="mt-2 text-muted-foreground">
            설교를 선택하여 퀴즈 학습을 시작하세요.
          </p>
        </div>

        {error && (
          <Card>
            <CardContent className="py-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>설교 선택</CardTitle>
            <CardDescription>
              학습할 설교를 선택하세요. 설교 내용을 바탕으로 퀴즈가 자동
              생성됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/sermons">
                <BookOpen className="mr-2 size-4" />
                설교 목록에서 선택하기
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase: Loading
  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="mb-4 size-10 animate-spin text-muted-foreground" />
        <p className="text-lg font-medium">퀴즈를 생성하고 있습니다...</p>
        <p className="mt-2 text-sm text-muted-foreground">
          설교 내용을 분석하여 학습 문제를 만들고 있어요.
        </p>
      </div>
    );
  }

  // Phase: Results
  if (phase === "results") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="size-7" />
            학습 결과
          </h1>
          {sermonTitle && (
            <p className="mt-2 text-muted-foreground">{sermonTitle}</p>
          )}
        </div>

        {/* Score Summary */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-4xl">
              {scorePercent}
              <span className="text-2xl text-muted-foreground">%</span>
            </CardTitle>
            <CardDescription>
              {questions.length}문제 중 {correctCount}문제 정답
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {scorePercent >= 80 ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                훌륭합니다!
              </Badge>
            ) : scorePercent >= 50 ? (
              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                좋은 시작이에요!
              </Badge>
            ) : (
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                다시 한번 도전해보세요!
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Individual Results */}
        <div className="space-y-4">
          {results.map((result, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start gap-2">
                  {result.isCorrect ? (
                    <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
                  )}
                  <div>
                    <CardTitle className="text-base">
                      Q{i + 1}. {questions[i].question}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    나의 답변
                  </p>
                  <p className="text-sm">{result.userAnswer}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    모범 답안
                  </p>
                  <p className="text-sm">{result.expectedAnswer}</p>
                </div>
                {result.feedback && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        피드백
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {result.feedback}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {sermonId && (
            <Button
              onClick={() => generateQuiz(sermonId)}
              variant="outline"
            >
              <RefreshCw className="mr-2 size-4" />
              다시 도전하기
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/sermons">
              <BookOpen className="mr-2 size-4" />
              다른 설교 선택
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Phase: Quiz (answering questions)
  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex) / questions.length) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="size-6" />
          학습 퀴즈
        </h1>
        {sermonTitle && (
          <p className="mt-1 text-sm text-muted-foreground">{sermonTitle}</p>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            문제 {currentIndex + 1} / {questions.length}
          </span>
          <span>{Math.round(progress)}% 완료</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Q{currentIndex + 1}. {currentQuestion.question}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="답변을 입력하세요..."
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            rows={4}
            disabled={submitting}
            className="resize-none"
          />
        </CardContent>
        <CardFooter className="flex justify-between">
          <p className="text-xs text-muted-foreground">
            설교 내용을 떠올리며 답변해보세요.
          </p>
          <Button
            onClick={submitAnswer}
            disabled={!currentAnswer.trim() || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                채점 중...
              </>
            ) : currentIndex < questions.length - 1 ? (
              <>
                제출하고 다음으로
                <ArrowRight className="ml-2 size-4" />
              </>
            ) : (
              <>
                제출하고 결과 보기
                <Trophy className="ml-2 size-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Previous results (if any) */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            이전 답변 결과
          </h3>
          {results.map((result, i) => (
            <Card key={i} className="opacity-80">
              <CardHeader className="py-3">
                <div className="flex items-center gap-2">
                  {result.isCorrect ? (
                    <CheckCircle className="size-4 text-green-600" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                  <CardTitle className="text-sm">
                    Q{i + 1}. {questions[i].question}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <p className="text-xs text-muted-foreground">
                  {result.feedback}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>}>
      <StudyPageInner />
    </Suspense>
  );
}
