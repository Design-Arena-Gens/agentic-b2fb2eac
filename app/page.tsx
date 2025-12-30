/* eslint-disable jsx-a11y/label-has-associated-control */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ConversionPayload,
  convertToExpertAdvisor,
  parseIndicatorInputs,
  type IndicatorInput
} from "@/lib/convert";

type LogicType = "crossover" | "threshold" | "custom";

const sampleIndicator = `#property indicator_separate_window
#property indicator_buffers 2

input int FastPeriod = 12;
input int SlowPeriod = 26;

double FastBuffer[];
double SlowBuffer[];

int OnInit() {
  SetIndexBuffer(0, FastBuffer);
  SetIndexBuffer(1, SlowBuffer);
  return(INIT_SUCCEEDED);
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
  int start = MathMax(FastPeriod, SlowPeriod);
  for(int i = start; i < rates_total; i++) {
    FastBuffer[i] = iMA(NULL, 0, FastPeriod, 0, MODE_EMA, PRICE_CLOSE, i);
    SlowBuffer[i] = iMA(NULL, 0, SlowPeriod, 0, MODE_EMA, PRICE_CLOSE, i);
  }
  return(rates_total);
}`;

const sampleCustomLogic = `double fast = GetIndicatorValue(0, 0);
double slow = GetIndicatorValue(1, 0);
double fastPrev = GetIndicatorValue(0, 1);
double slowPrev = GetIndicatorValue(1, 1);

if(fast == EMPTY_VALUE || slow == EMPTY_VALUE) return;

bool hasBuy = HasOpenPosition(1);
bool hasSell = HasOpenPosition(-1);

bool bullishCross = fastPrev <= slowPrev && fast > slow;
bool bearishCross = fastPrev >= slowPrev && fast < slow;

if(bullishCross) {
  if(CloseOppositeSignal && hasSell) ClosePositions(-1);
  if(!hasBuy) OpenOrder(OP_BUY);
} else if(bearishCross) {
  if(CloseOppositeSignal && hasBuy) ClosePositions(1);
  if(!hasSell) OpenOrder(OP_SELL);
}`;

const logicLabels: Record<LogicType, string> = {
  crossover: "Buffer crossover",
  threshold: "Threshold / Band",
  custom: "Custom snippet"
};

function IndicatorInsights({ inputs }: { inputs: IndicatorInput[] }) {
  if (!inputs.length) {
    return (
      <p className="helper">
        No <span className="inline-code">input</span> or <span className="inline-code">extern</span> parameters were detected.
        They can still be added manually inside the generated EA.
      </p>
    );
  }

  return (
    <div className="helper">
      <strong>Detected parameters ({inputs.length}): </strong>
      {inputs.map((input) => (
        <span key={input.name} className="inline-code" style={{ marginRight: "0.35rem" }}>
          {input.name} = {input.defaultValue}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const [indicatorName, setIndicatorName] = useState("MyIndicator");
  const [indicatorCode, setIndicatorCode] = useState(sampleIndicator);
  const [timeframeExpression, setTimeframeExpression] = useState("_Period");
  const [logicType, setLogicType] = useState<LogicType>("crossover");
  const [generatedCode, setGeneratedCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [lotSize, setLotSize] = useState(0.10);
  const [slippage, setSlippage] = useState(3);
  const [stopLoss, setStopLoss] = useState(300);
  const [takeProfit, setTakeProfit] = useState(600);
  const [magicNumber, setMagicNumber] = useState(123456);

  const [allowMultiplePositions, setAllowMultiplePositions] = useState(false);
  const [reverseCrossover, setReverseCrossover] = useState(false);
  const [fastBuffer, setFastBuffer] = useState(0);
  const [slowBuffer, setSlowBuffer] = useState(1);

  const [thresholdBuffer, setThresholdBuffer] = useState(0);
  const [thresholdMode, setThresholdMode] = useState<"above" | "below" | "band">("band");
  const [thresholdUpper, setThresholdUpper] = useState("70");
  const [thresholdLower, setThresholdLower] = useState("30");

  const [customSnippet, setCustomSnippet] = useState(sampleCustomLogic);

  const detectedInputs = useMemo(() => parseIndicatorInputs(indicatorCode), [indicatorCode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleGenerate = () => {
    setIsGenerating(true);

    try {
      const payload: ConversionPayload = {
        indicatorName,
        indicatorCode,
        timeframeExpression,
        lots: Number.isFinite(lotSize) && lotSize > 0 ? lotSize : 0.10,
        slippage: Number.isFinite(slippage) ? slippage : 3,
        stopLoss: Number.isFinite(stopLoss) && stopLoss >= 0 ? stopLoss : 0,
        takeProfit: Number.isFinite(takeProfit) && takeProfit >= 0 ? takeProfit : 0,
        magicNumber: Number.isFinite(magicNumber) ? magicNumber : 123456,
        logicConfig: (() => {
          if (logicType === "crossover") {
            return {
              kind: "crossover" as const,
              fastBuffer: Math.max(0, fastBuffer),
              slowBuffer: Math.max(0, slowBuffer),
              allowMultiplePositions,
              reverseSignal: reverseCrossover
            };
          }

          if (logicType === "threshold") {
            const upper = parseFloat(thresholdUpper);
            const lower = parseFloat(thresholdLower);
            return {
              kind: "threshold" as const,
              buffer: Math.max(0, thresholdBuffer),
              upper: Number.isFinite(upper) ? upper : undefined,
              lower: Number.isFinite(lower) ? lower : undefined,
              direction: thresholdMode,
              allowMultiplePositions
            };
          }

          return {
            kind: "custom" as const,
            snippet: customSnippet
          };
        })()
      };

      const result = convertToExpertAdvisor(payload);
      setGeneratedCode(result);
      setToast("Generated EA code");
    } catch (error) {
      console.error("Conversion failed", error);
      setGeneratedCode("// Conversion failed. Check the console for details.");
      setToast("Conversion failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setToast("Copied to clipboard");
    } catch (error) {
      console.error("Copy failed", error);
      setToast("Unable to copy");
    }
  };

  return (
    <main className="container">
      <header style={{ marginBottom: "2.5rem" }}>
        <div className="badge">MetaTrader 4 · Expert Advisor Builder</div>
        <h1 className="section-title" style={{ marginTop: "1rem" }}>
          Convert your indicator into a trading robot
        </h1>
        <p className="muted" style={{ maxWidth: "720px" }}>
          Paste the source code of your MQL4 indicator, pick the execution logic, and instantly get an
          Expert Advisor template that calls the indicator through <span className="inline-code">iCustom</span>.
          The generator also carries the indicator inputs so you can tweak parameters in the EA.
        </p>
      </header>

      <section className="grid two">
        <div className="card">
          <label className="label">Indicator filename</label>
          <input
            className="field"
            type="text"
            value={indicatorName}
            onChange={(event) => setIndicatorName(event.target.value)}
            placeholder="Indicator file name without extension (e.g. MyIndicator)"
          />
          <p className="helper">
            Use the exact name of the <span className="inline-code">.mq4</span> or <span className="inline-code">.ex4</span> indicator file. The EA will reference it via <span className="inline-code">iCustom</span>.
          </p>

          <label className="label" style={{ marginTop: "1.5rem" }}>
            Indicator timeframe expression
          </label>
          <input
            className="field"
            type="text"
            value={timeframeExpression}
            onChange={(event) => setTimeframeExpression(event.target.value)}
            placeholder="_Period"
          />
          <p className="helper">
            Accepts <span className="inline-code">_Period</span>, <span className="inline-code">PERIOD_H1</span>, or any custom timeframe macro.
          </p>

          <label className="label" style={{ marginTop: "1.5rem" }}>
            Risk template
          </label>
          <div className="grid" style={{ gap: "1rem" }}>
            <div>
              <span className="helper">Lot size</span>
              <input
                className="field"
                type="number"
                step="0.01"
                min="0.01"
                value={lotSize}
                onChange={(event) => setLotSize(parseFloat(event.target.value))}
              />
            </div>
            <div>
              <span className="helper">Slippage (points)</span>
              <input
                className="field"
                type="number"
                step="1"
                value={slippage}
                onChange={(event) => setSlippage(parseInt(event.target.value, 10) || 0)}
              />
            </div>
            <div>
              <span className="helper">Stop Loss (points)</span>
              <input
                className="field"
                type="number"
                step="1"
                min="0"
                value={stopLoss}
                onChange={(event) => setStopLoss(parseInt(event.target.value, 10) || 0)}
              />
            </div>
            <div>
              <span className="helper">Take Profit (points)</span>
              <input
                className="field"
                type="number"
                step="1"
                min="0"
                value={takeProfit}
                onChange={(event) => setTakeProfit(parseInt(event.target.value, 10) || 0)}
              />
            </div>
            <div>
              <span className="helper">Magic number</span>
              <input
                className="field"
                type="number"
                step="1"
                value={magicNumber}
                onChange={(event) => setMagicNumber(parseInt(event.target.value, 10) || 0)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <label className="label">Indicator source code</label>
          <textarea
            className="field textarea"
            value={indicatorCode}
            onChange={(event) => setIndicatorCode(event.target.value)}
            spellCheck={false}
          />
          <IndicatorInsights inputs={detectedInputs} />
        </div>
      </section>

      <section className="card" style={{ marginTop: "2rem" }}>
        <h2 className="section-title">Trading logic</h2>
        <p className="muted" style={{ marginBottom: "1.5rem" }}>
          Choose how the EA should interpret your indicator buffers. The helper functions <span className="inline-code">GetIndicatorValue</span>, <span className="inline-code">OpenOrder</span>, and <span className="inline-code">ClosePositions</span> are already generated for you.
        </p>

        <div className="radio-group">
          {(Object.keys(logicLabels) as LogicType[]).map((key) => (
            <label key={key} className={`radio ${logicType === key ? "active" : ""}`}>
              <input
                type="radio"
                checked={logicType === key}
                onChange={() => setLogicType(key)}
              />
              {logicLabels[key]}
            </label>
          ))}
        </div>

        <div className="grid" style={{ marginTop: "1.5rem", gap: "1.5rem" }}>
          {logicType === "crossover" && (
            <>
              <div>
                <label className="label">Fast buffer index</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={fastBuffer}
                  onChange={(event) => setFastBuffer(parseInt(event.target.value, 10) || 0)}
                />
              </div>
              <div>
                <label className="label">Slow buffer index</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={slowBuffer}
                  onChange={(event) => setSlowBuffer(parseInt(event.target.value, 10) || 0)}
                />
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <label className="helper" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={allowMultiplePositions}
                    onChange={(event) => setAllowMultiplePositions(event.target.checked)}
                  />
                  Allow stacking positions
                </label>
                <label className="helper" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={reverseCrossover}
                    onChange={(event) => setReverseCrossover(event.target.checked)}
                  />
                  Reverse signals
                </label>
              </div>
            </>
          )}

          {logicType === "threshold" && (
            <>
              <div>
                <label className="label">Buffer index</label>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={thresholdBuffer}
                  onChange={(event) => setThresholdBuffer(parseInt(event.target.value, 10) || 0)}
                />
              </div>
              <div>
                <label className="label">Mode</label>
                <select
                  className="field"
                  value={thresholdMode}
                  onChange={(event) => setThresholdMode(event.target.value as typeof thresholdMode)}
                >
                  <option value="band">Band (upper / lower)</option>
                  <option value="above">Trigger when above</option>
                  <option value="below">Trigger when below</option>
                </select>
              </div>
              <div className="grid" style={{ gap: "1rem" }}>
                <div>
                  <span className="helper">Upper threshold</span>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    value={thresholdUpper}
                    onChange={(event) => setThresholdUpper(event.target.value)}
                  />
                </div>
                <div>
                  <span className="helper">Lower threshold</span>
                  <input
                    className="field"
                    type="number"
                    step="0.01"
                    value={thresholdLower}
                    onChange={(event) => setThresholdLower(event.target.value)}
                  />
                </div>
              </div>
              <label className="helper" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={allowMultiplePositions}
                  onChange={(event) => setAllowMultiplePositions(event.target.checked)}
                />
                Allow stacking positions
              </label>
            </>
          )}

          {logicType === "custom" && (
            <div>
              <label className="label">Custom MQL4 snippet</label>
              <textarea
                className="field textarea short"
                value={customSnippet}
                onChange={(event) => setCustomSnippet(event.target.value)}
                spellCheck={false}
              />
              <p className="helper">
                The snippet runs inside <span className="inline-code">OnTick</span>. You can call helper functions such as <span className="inline-code">GetIndicatorValue(buffer, shift)</span>, <span className="inline-code">OpenOrder(direction)</span>, and <span className="inline-code">ClosePositions(direction)</span>.
              </p>
            </div>
          )}
        </div>

        <button
          className="button"
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{ marginTop: "2rem" }}
        >
          {isGenerating ? "Generating…" : "Generate Expert Advisor"}
        </button>
      </section>

      {generatedCode && (
        <section className="card" style={{ marginTop: "2rem" }}>
          <h2 className="section-title">Generated EA</h2>
          <p className="helper">
            Save the output as <span className="inline-code">.mq4</span>, compile in MetaEditor, and attach the EA to a chart.
          </p>
          <div className="result">{generatedCode}</div>
          <div className="code-toolbar">
            <button className="button" type="button" onClick={handleCopy}>
              Copy code
            </button>
          </div>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
