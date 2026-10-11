<!-- Web-facing editable report source derived from ../03 Native Website Report.md. Keep this file portable: standard Markdown and /report-assets paths only. -->

# From Climate-Risk Forecasts to Resilience Investment Decisions in ERCOT

*An optimization continuation of the ERCOT efficiency and price-loss forecasting study*

The forecasting study behind this project estimated how climate-linked changes in power-plant efficiency could translate into long-run economic losses across the Texas electricity market. It showed where losses could build, but it stopped before the question I wanted to answer: if resilience funding is limited, where should the next dollar go?

I built this continuation around that question. The model connects forecast-derived losses across seven energy sources and 18 source-specific geographic clusters to a constrained investment-allocation problem. I formulated the original implementation in AMPL and solved it with SNOPT under the mentorship of Michael Saunders.

In the Moderate reference case, the model allocates a $5.0 billion budget and produces $10.390 billion in modeled avoided cumulative loss over the 2025–2050 forecasting horizon. That comes to 2.078 dollars of modeled avoided loss per dollar allocated. The result is concentrated: natural gas receives 75.77% of the budget, followed by wind at 14.14% and coal at 8.02%.

> [!note] Research status
> This is a continuation of previous independent research. The results depend on the forecasting inputs and investment-response assumptions described below. The project is in the process of being included on the Stanford Systems Optimization Laboratory (SOL) page. The results should not be read as a causal evaluation of resilience projects or an investment recommendation.

## 1. The decision problem

The upstream study projected ERCOT operational efficiency and residual price variability from January 2025 through December 2050. It combined NOAA GFDL-CM4 climate projections with generation, consumption, price, revenue, and power-plant location data from the U.S. Energy Information Administration. Random-forest and hybrid SARIMA–XGBoost models projected generation, fuel consumption, and operational efficiency; a supporting Gaussian-process model connected projected efficiency changes to electricity-price variability and economic loss.

Plants were assigned to the nearest approximately 200-kilometer climate-grid centroid and separated by energy source. This produced 18 source-specific clusters spread across ten geographic cells. A single cell can contain several clusters—for example, natural gas, nuclear, and petroleum plants—while each cluster retains its own source identity in the optimization.

The upstream paper estimated cumulative retail-energy-provider losses of $19.7 billion under its optimistic case, $31.4 billion under its mean case, and $43.1 billion under its pessimistic case. I used the $43.1 billion pessimistic provider-loss scenario as the cluster-level baseline for this allocation study. It is a cumulative modeled loss over 26 calendar years, not a $43.1 billion annual loss.

A risk forecast can tell us where exposure is concentrated. It still cannot tell us whether a dollar spent in one region has more modeled value than a dollar spent somewhere else. For that, I needed an explicit response function, a common budget, and a way to compare marginal benefits.

## 2. Translating loss into an allocation model

For each cluster $i$, the model chooses a nonnegative investment $x_i$. The formulation minimizes total residual loss:

$$
\min_{x_i \ge 0}\; \Phi(x)
=\sum_i L_i\left(1-\frac{a_{s(i)}x_i}{x_i+b_{s(i)}}\right),
\qquad
\sum_i x_i\le B.
$$

Here, $L_i$ is the cumulative loss assigned to cluster $i$, $B$ is the total budget, and $s(i)$ identifies the cluster's energy source. The parameter $a_s$ caps the fraction of loss that investment can avoid for source $s$. The parameter $b_s$, measured in millions of dollars, determines how quickly diminishing returns begin.

The response deliberately saturates. Early investment in a high-exposure cluster can remove a relatively large amount of modeled loss, but that cluster becomes less attractive as more capital flows into it. The optimizer compares the remaining marginal reduction across all 18 clusters. Funded clusters move toward a shared cutoff; clusters that begin below it receive nothing at the current budget.

I calibrated $b_s$ from a source-level annual avoided-loss assumption, a planning horizon, and a discount rate:

$$
b_s=\frac{a_sL_{\mathrm{rep},s}}{R_sAF(r_s,H_s)},
\qquad
AF(r,H)=\frac{1-(1+r)^{-H}}{r}.
$$

For natural gas, the base assumptions are a maximum avoidable fraction of 0.65, $0.150 million in annual avoided loss per $1 million invested, a 15-year planning horizon, and a 5.5% discount rate. With a representative cluster loss of $6.340 billion, these values produce a $b$ scale of $2.737 billion.

| Source | Maximum avoidable fraction (a) | Annual avoided loss per $1M invested | Horizon | Discount rate | Derived (b) ($M) |
|---|---:|---:|---:|---:|---:|
| Natural gas | 0.65 | $0.150M | 15 years | 5.5% | 2,736.88 |
| Coal | 0.60 | $0.090M | 20 years | 7.0% | 1,162.87 |
| Nuclear | 0.70 | $0.120M | 25 years | 5.0% | 15.12 |
| Solar | 0.55 | $0.080M | 20 years | 6.0% | 625.86 |
| Wind | 0.60 | $0.100M | 20 years | 6.0% | 684.46 |
| Hydroelectric | 0.65 | $0.085M | 30 years | 4.5% | 0.18 |
| Petroleum | 0.55 | $0.075M | 15 years | 7.0% | 0.83 |

These are project assumptions, not experimentally estimated treatment effects. I no longer have the original external citations used during the first calibration, so I treat the values as visible scenario inputs rather than established engineering constants. The project log also contains a prose example stating $15 million rather than $0.15 million for natural gas. The implemented $0.15 million value above is the one used in every result.

## 3. Three investment-effectiveness scenarios

I tested three versions of the investment response while holding the $43.1 billion loss baseline fixed. The Pessimistic case uses the base $a$ and $b$ parameters. The Moderate case raises $a$ by 15% and lowers $b$ by 15%. The Optimistic case raises $a$ by 30% and lowers $b$ by 30%. The later scenarios assume that resilience investment can address a larger portion of loss and reach meaningful reductions with less capital.

I solved each scenario at 20 discrete budgets between $0.1 billion and $40 billion. Avoided loss rises with spending, but the curve flattens as the best opportunities saturate.

![](/report-assets/01_all_scenarios_budget_vs_avoided_loss.png)

*Figure 1. Avoided loss by budget, three scenarios.*

The second frontier divides avoided loss by the budget. I called this value modeled ROI in the notebook, but avoided-loss-to-budget ratio is more precise. It is not an accounting return, IRR, or expected cash yield.

![](/report-assets/02_all_scenarios_budget_vs_roi.png)

*Figure 2. Avoided loss per dollar by budget.*

At $1 billion, modeled avoided loss ranges from $2.650 billion in the Pessimistic case to $4.558 billion in the Optimistic case. At $5 billion, the range is $8.238–$13.041 billion. At $10 billion, it is $11.907–$18.257 billion. More favorable response assumptions increase both the height of the frontier and the budget that can be deployed before marginal modeled benefit falls below one.

## 4. Selecting a reference budget

I did not treat one budget as universally optimal. Instead, I used a threshold rule: a candidate had to produce at least $10 billion in modeled avoided loss, keep the total avoided-loss-to-budget ratio at or above 1.0, and keep the marginal ratio at or above 1.0 relative to the preceding tested cap. I then selected the largest tested budget that passed all three.

| Scenario | Selected budget | Modeled avoided loss | Total ratio | Marginal ratio |
|---|---:|---:|---:|---:|
| Pessimistic | $0.1B fallback | $0.332B | 3.321 | — |
| Moderate | $5.0B | $10.390B | 2.078 | 1.247 |
| Optimistic | $7.5B | $16.005B | 2.134 | 1.185 |

In the Moderate case, $5 billion passes every threshold, while the next tested cap—$7.5 billion—has a marginal ratio of 0.990. In the Optimistic case, $7.5 billion passes, while $10 billion falls to a marginal ratio of 0.901. No Pessimistic point passes all three requirements, so its $0.1 billion entry is only a fallback to the highest sampled total ratio. It was not selected on the same basis as the other two points.

The $5 billion Moderate case is therefore a useful reference, not a unique mathematical optimum. A policymaker with a different minimum benefit, risk tolerance, or budget constraint could reasonably select another point on the same frontier.

## 5. Where the Moderate budget goes

At low budgets, the model concentrates capital where the combination of dollar exposure and modeled response is strongest. At $1 billion, natural gas receives 83.38% and wind receives the remaining 16.62%. Coal does not enter materially until the $5 billion case, while solar’s share expands as the budget grows to $10 billion.

![](/report-assets/03_source_allocation_share_by_budget_cap_moderate_scenario.png)

*Figure 3. Allocation by source at $1B, $5B, and $10B (Moderate).*

The $5 billion reference case is even more concentrated:

| Cluster | Baseline modeled loss | Allocation | Budget share |
|---|---:|---:|---:|
| Natural gas cluster 0 | $14.457B | $2.343B | 46.86% |
| Natural gas cluster 2 | $9.435B | $1.445B | 28.91% |
| Wind cluster 0 | $3.804B | $0.569B | 11.38% |
| Coal cluster 0 | $3.263B | $0.401B | 8.02% |

These four clusters receive 95.16% of the budget while representing 71.83% of baseline loss. The two leading natural-gas clusters alone receive 75.77% of the budget but contain 55.43% of loss. The optimizer is not copying the loss distribution. The response assumptions and marginal-return cutoff push the allocation further toward the leaders.

The zeroes do not mean that the unfunded clusters are safe or unimportant. Natural-gas clusters 1 and 3 still contain $3.189 billion and $3.245 billion in modeled loss, yet they receive no allocation at $5 billion. Solar cluster 2 and coal cluster 1 also retain material exposure without funding. Under this budget and calibration, their next modeled dollar of benefit simply ranks below the funded alternatives.

The answer changes as the budget expands. Natural gas declines from 83.38% at $1 billion to 73.10% at $10 billion, while solar rises from zero to 4.33%. Diminishing returns gradually diversify the portfolio; the $10 billion allocation is not just the $1 billion allocation multiplied by ten.

## 6. Physical risk and economic priority are not the same map

The clearest result appears when I aggregate the 18 source-clusters back to their ten shared centroids. The cell at (29.0, −96.25) contains $14.496 billion in modeled loss and receives 46.97% of the reference budget. The cell at (33.0, −96.25) contains $10.479 billion and receives another 29.31%. Together, they receive 76.28% of the budget while containing 57.95% of baseline loss.

![](/report-assets/04_ercot_climate_resilience_loss_exposure_and_optimized_allocation.png)

*Figure 4. Loss and $5B Moderate allocation by grid cell.*

The upstream paper ranked the cell at (29.0, −98.75) as the most severe physical-risk region based on average efficiency deficits. Yet that cell contains only $0.463 billion in the optimization's dollar-loss baseline and receives roughly $67,000, or 0.0013% of the budget. By contrast, the (29.0, −96.25) cell had an upstream physical-risk rank of nine but receives nearly half the investment budget because it contains the largest natural-gas loss cluster.

There is no contradiction: the two rankings answer different questions. The upstream rank measures projected physical deficit severity. The optimization weighs cumulative economic exposure together with assumed intervention effectiveness. A hazard map is not automatically an investment map. Moving from one to the other requires a decision model, and the assumptions inside that model need to stay visible.

## 7. Stress-testing the reference case

The deterministic result depends on exact values for cluster loss, $a$, and $b$. To see how fragile it was, I ran 300 Monte Carlo trials around the Moderate case at a fixed $5 billion budget. Each trial independently perturbed $a$ with a 10% standard deviation, $b$ with a 20% standard deviation, and cluster loss with a 15% standard deviation. A fixed seed of 42 makes the experiment reproducible.

Median avoided loss was $10.579 billion, close to the deterministic estimate of $10.390 billion. The 5th–95th percentile range was $8.178–$13.803 billion. Every stored trial produced an avoided-loss-to-budget ratio above one; the minimum was 1.440 and the median was 2.116.

![](/report-assets/05_monte_carlo_distribution_of_avoided_loss_moderate_scenario_reference_budget_50b.png)

*Figure 5. Avoided loss across 300 sensitivity trials.*

The source hierarchy was more stable than the exact benefit. Natural gas averaged 75.87% of allocation with a standard deviation of 5.50 percentage points. Wind averaged 14.20%, and coal averaged 7.55%. Solar was less stable relative to its size, averaging 2.18% with a 2.02-point standard deviation.

![](/report-assets/08_monte_carlo_distribution_of_source_allocation_shares_broken_y_axis_moderate_scen.png)

*Figure 6. Allocation share by source across 300 trials.*

The stress test says something useful but limited. The broad allocation pattern survives moderate perturbations, while the amount of avoided loss still moves substantially. The results do not imply a 100% real-world probability of positive return. These shocks are independent normal sensitivity inputs, not an estimated joint distribution of climate, construction, technology, and market uncertainty.

## 8. What the model establishes—and what it leaves open

The result I care about most is the gap between physical-risk severity and economic investment priority. The model also shows that the portfolio depends on the size of the budget: low budgets concentrate, while larger budgets admit more sources and clusters. Across the sensitivity trials, the leading source hierarchy remains recognizable even though the modeled benefit moves by several billion dollars.

I do not read the model as a list of projects that ERCOT should immediately fund. It allocates a single fungible budget and does not represent specific technologies, construction timelines, maintenance, financing, project indivisibility, or implementation cost. It also omits transmission constraints, reliability spillovers, source substitution, cross-cluster dependence, political feasibility, and distributional equity.

The spatial layer is deliberately coarse: ten climate-grid centroids cannot identify a county-level site. The economic layer inherits every uncertainty in the upstream climate, efficiency, price, and loss forecasts. Most importantly, the source-response parameters require renewed empirical calibration with traceable intervention studies before the model could support operational planning.

A useful next version would not simply run the solver at more budget levels. It would model named resilience technologies, staged investment over time, network constraints, and uncertainty sets grounded in empirical cost and effectiveness data. A robust or distributionally robust formulation could then ask which allocations remain defensible when the response assumptions are wrong.

## 9. Materials and credits

The quantitative source of truth for this page is the frozen V4 results export, with CSV audit tables and standalone figure assets. The full computational workflow is preserved in the V4 optimization notebook. Background forecasting methods and results come from the upstream ERCOT paper, and the original optimization reasoning is preserved in the project log.

- Upstream forecasting paper: Tianle Liang and Kieran Rosenfeld
- Optimization continuation, experiments, analysis, and web artifact: Tianle Liang
- Mentorship: Michael Saunders
- SNOPT: developed by Philip Gill, Walter Murray, and Michael Saunders

The original experiments were formulated in AMPL and solved with SNOPT. The public simulator on this page reproduces the same allocation logic without exposing private credentials or requiring visitors to access a licensed solver.
