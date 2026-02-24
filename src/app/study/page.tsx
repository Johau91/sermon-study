"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  BookOpen,
  Trophy,
} from "lucide-react";

interface QuizQuestion {
  id?: Id<"quizRecords">;
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
  const sermonIdParam = searchParams.get("sermonId");

  const [phase, setPhase] = useState<StudyPhase>("select");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sermonTitle, setSermonTitle] = useState<string>("");
  const [convexSermonId, setConvexSermonId] = useState<Id<"sermons"> | null>(null);

  const sermon = useQuery(
    api.sermons.getByOriginalId,
    sermonIdParam ? { originalId: Number(sermonIdParam) } : "skip"
  );

  const generateQuizAction = useAction(api.openrouter.generateQuiz);
  const gradeAnswerAction = useAction(api.openrouter.gradeAnswer);
  const saveQuizRecords = useMutation(api.quiz.saveQuizRecords);
  const submitAnswerMutation = useMutation(api.quiz.submitAnswer);

  const generateQuiz = useCallback(
    async (sid: string) => {
      try {
        setPhase("loading");
        setError(null);

        if (!sermon) return;
        setSermonTitle(sermon.title);
        setConvexSermonId(sermon._id);

        const content =
          sermon.transcriptRaw || sermon.summary || sermon.title;

        const quizItems = await generateQuizAction({
          sermonTitle: sermon.title,
          sermonContent: content,
        });

        // Save to DB
        const ids = await saveQuizRecords({
          sermonId: sermon._id,
          questions: quizItems,
        });

        const quizQuestions: QuizQuestion[] = quizItems.map(
          (item: { question: string; expected_answer: string }, i: number) => ({
            id: ids[i],
            question: item.question,
            expected_answer: item.expected_answer,
          })
        );

        if (quizQuestions.length === 0) {
          throw new Error(
            "퀴즈 문제를 만들 수 없습니다. 설교 내용을 확인해주세요."
          );
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
    [sermon, generateQuizAction, saveQuizRecords]
  );

  useEffect(() => {
    if (sermonIdParam && sermon) {
      generateQuiz(sermonIdParam);
    }
  }, [sermonIdParam, sermon, generateQuiz]);

  const submitAnswer = async () => {
    if (!currentAnswer.trim() || submitting) return;
    setSubmitting(true);
    const currentQuestion = questions[currentIndex];

    try {
      const gradeResult = await gradeAnswerAction({
        question: currentQuestion.question,
        expectedAnswer: currentQuestion.expected_answer,
        userAnswer: currentAnswer.trim(),
      });

      // Save to DB
      if (currentQuestion.id) {
        await submitAnswerMutation({
          quizId: currentQuestion.id,
          userAnswer: currentAnswer.trim(),
          isCorrect: gradeResult.isCorrect,
          feedback: gradeResult.feedback,
        });
      }

      const result: QuizResult = {
        questionIndex: currentIndex,
        isCorrect: gradeResult.isCorrect,
        feedback: gradeResult.feedback,
        userAnswer: currentAnswer.trim(),
        expectedAnswer: currentQuestion.expected_answer,
      };

      const newAnswers = [...userAnswers];
      newAnswers[currentIndex] = currentAnswer.trim();
      setUserAnswers(newAnswers);
      setResults((prev) => [...prev, result]);

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

  if (phase === "select") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            학습
          </h1>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            설교를 선택하여 퀴즈 학습을 시작하세요.
          </p>
        </div>
        {error && (
          <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
          <h2 className="text-lg font-bold text-foreground">설교 선택</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            학습할 설교를 선택하세요. 설교 내용을 바탕으로 퀴즈가 자동 생성됩니다.
          </p>
          <Link
            href="/sermons"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3182F6] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] active:scale-[0.97] sm:w-auto"
          >
            <BookOpen className="size-4" />
            설교 목록에서 선택하기
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-[#3182F6]/10">
          <Loader2 className="size-8 animate-spin text-[#3182F6]" />
        </div>
        <p className="text-lg font-bold text-foreground">퀴즈를 생성하고 있습니다...</p>
        <p className="mt-2 text-sm text-muted-foreground">
          설교 내용을 분석하여 학습 문제를 만들고 있어요.
        </p>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            학습 결과
          </h1>
          {sermonTitle && (
            <p className="mt-2 text-base leading-7 text-muted-foreground">{sermonTitle}</p>
          )}
        </div>
        <div className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#3182F6]/10">
            <Trophy className="size-8 text-[#3182F6]" />
          </div>
          <p className="text-[40px] font-bold text-foreground">
            {scorePercent}
            <span className="text-xl text-subtle">%</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length}문제 중 {correctCount}문제 정답
          </p>
          <div className="mt-4">
            {scorePercent >= 80 ? (
              <span className="rounded-full bg-green-50 px-4 py-1.5 text-sm font-medium text-green-600 dark:bg-green-950/30 dark:text-green-400">
                훌륭합니다!
              </span>
            ) : scorePercent >= 50 ? (
              <span className="rounded-full bg-yellow-50 px-4 py-1.5 text-sm font-medium text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-400">
                좋은 시작이에요!
              </span>
            ) : (
              <span className="rounded-full bg-orange-50 px-4 py-1.5 text-sm font-medium text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                다시 한번 도전해보세요!
              </span>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {results.map((result, i) => (
            <div key={i} className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
              <div className="flex items-start gap-3">
                {result.isCorrect ? (
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/30">
                    <CheckCircle className="size-4 text-green-500" />
                  </div>
                ) : (
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
                    <XCircle className="size-4 text-red-500" />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <p className="text-base font-semibold leading-7 text-foreground">
                    Q{i + 1}. {questions[i].question}
                  </p>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs font-medium text-subtle mb-1">나의 답변</p>
                    <p className="text-sm text-foreground">{result.userAnswer}</p>
                  </div>
                  <div className="rounded-xl bg-[#3182F6]/5 p-3">
                    <p className="text-xs font-medium text-[#3182F6]/60 mb-1">모범 답안</p>
                    <p className="text-sm text-foreground">{result.expectedAnswer}</p>
                  </div>
                  {result.feedback && (
                    <p className="text-sm text-muted-foreground">{result.feedback}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {sermonIdParam && (
            <button
              type="button"
              onClick={() => generateQuiz(sermonIdParam)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-medium text-foreground ring-1 ring-border transition-all hover:bg-muted active:scale-[0.97] sm:w-auto"
            >
              <RefreshCw className="size-4" />
              다시 도전하기
            </button>
          )}
          <Link
            href="/sermons"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-medium text-foreground ring-1 ring-border transition-all hover:bg-muted active:scale-[0.97] sm:w-auto"
          >
            <BookOpen className="size-4" />
            다른 설교 선택
          </Link>
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:w-auto"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  // Phase: Quiz
  const currentQuestion = questions[currentIndex];
  const progress = (currentIndex / questions.length) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-[22px]">
          학습 퀴즈
        </h1>
        {sermonTitle && (
          <p className="mt-1 text-base leading-7 text-muted-foreground">{sermonTitle}</p>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-foreground">
            문제 {currentIndex + 1} / {questions.length}
          </span>
          <span className="text-subtle">{Math.round(progress)}% 완료</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[#3182F6] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border sm:p-6">
        <p className="text-lg font-bold leading-8 text-foreground">
          Q{currentIndex + 1}. {currentQuestion.question}
        </p>
        <textarea
          placeholder="답변을 입력하세요..."
          value={currentAnswer}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          rows={4}
          disabled={submitting}
          className="mt-5 w-full resize-none rounded-xl bg-muted p-4 text-base leading-7 text-foreground placeholder:text-subtle transition-all focus:bg-card focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-subtle">
            설교 내용을 떠올리며 답변해보세요.
          </p>
          <button
            type="button"
            onClick={submitAnswer}
            disabled={!currentAnswer.trim() || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3182F6] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#2B71DE] disabled:bg-muted disabled:text-muted-foreground active:scale-[0.97] sm:w-auto sm:py-2.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                채점 중...
              </>
            ) : currentIndex < questions.length - 1 ? (
              <>
                제출하고 다음으로
                <ArrowRight className="size-4" />
              </>
            ) : (
              <>
                제출하고 결과 보기
                <Trophy className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-subtle">이전 답변 결과</h3>
          {results.map((result, i) => (
            <div key={i} className="rounded-2xl bg-card/80 p-4 ring-1 ring-border">
              <div className="flex items-center gap-2">
                {result.isCorrect ? (
                  <CheckCircle className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                <p className="text-sm font-medium text-foreground">
                  Q{i + 1}. {questions[i].question}
                </p>
              </div>
              <p className="mt-2 pl-6 text-sm leading-6 text-muted-foreground">
                {result.feedback}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-[#3182F6]" />
        </div>
      }
    >
      <StudyPageInner />
    </Suspense>
  );
}
