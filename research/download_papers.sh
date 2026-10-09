#!/bin/bash
# Downloads the open-access papers for the CalmCampus evidence dossier into ./papers
# Run from the research/ folder:  bash download_papers.sh   (safe to re-run: existing PDFs are skipped)
set -u
mkdir -p papers
ok=0; skip=0; fail=0
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
get() { out="papers/$1"; shift
  if [ -s "$out" ] && head -c 4 "$out" | grep -q "%PDF"; then echo "HAVE   $out"; skip=$((skip+1)); return; fi
  for u in "$@"; do
    if curl -sSL -m 120 -A "$UA" -H "Accept: application/pdf,*/*" -o "$out" "$u" && head -c 4 "$out" | grep -q "%PDF"; then echo "OK     $out"; ok=$((ok+1)); return; fi
  done
  rm -f "$out"; echo "FAILED $out"; fail=$((fail+1)); }
get "Bruffaerts_2018_FreshmenMentalHealth.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC5846318&blobtype=pdf" "https://europepmc.org/articles/PMC5846318?pdf=render"
get "Auerbach_2018_WMHICSPrevalence.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6193834&blobtype=pdf" "https://europepmc.org/articles/PMC6193834?pdf=render"
get "Auerbach_2016_WMHCollegeStudents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC5129654&blobtype=pdf" "https://europepmc.org/articles/PMC5129654?pdf=render"
get "Mason_2025_WMHICS72288.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC11926851&blobtype=pdf" "https://europepmc.org/articles/PMC11926851?pdf=render"
get "Nuijen_2025_MonitorStudentenHboWo.pdf" "https://www.rivm.nl/bibliotheek/rapporten/2025-0106.pdf" "https://www.trimbos.nl/wp-content/uploads/2025/11/016521-Factsheet-MMMS-2025_EN.pdf"
get "Abraham_2024_StudentBurnoutCOVID.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC10831088&blobtype=pdf" "https://www.nature.com/articles/s41598-024-52923-6.pdf" "https://europepmc.org/articles/PMC10831088?pdf=render"
get "Hara_2026_StudentBurnoutInstruments.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC13330289&blobtype=pdf" "https://bmcpsychology.biomedcentral.com/counter/pdf/10.1186/s40359-026-04570-x" "https://europepmc.org/articles/PMC13330289?pdf=render"
get "Ebert_2019_BarriersTreatmentStudents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6522323&blobtype=pdf" "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/mpr.1782?download=true" "https://europepmc.org/articles/PMC6522323?pdf=render"
get "Gulliver_2010_HelpSeekingBarriers.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC3022639&blobtype=pdf" "https://bmcpsychiatry.biomedcentral.com/counter/pdf/10.1186/1471-244X-10-113" "https://europepmc.org/articles/PMC3022639?pdf=render"
get "Lindsay_2022_InsomniaPredictorsStudents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC9059737&blobtype=pdf" "https://europepmc.org/articles/PMC9059737?pdf=render"
get "Schuch_2018_PhysicalActivityDepression.pdf" "https://kclpure.kcl.ac.uk/ws/files/94279645/Physical_activity_and_incident_SCHUCH_Publishedonline25April2018_GREEN_AAM.pdf"
get "Scott_2021_SleepQualityMentalHealth.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC8651630&blobtype=pdf" "https://europepmc.org/articles/PMC8651630?pdf=render"
get "Freeman_2017_OASISSleepRCT.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC5614772&blobtype=pdf" "https://kclpure.kcl.ac.uk/ws/files/147411091/The_effects_of_improving_sleep_on_mental_health_OASIS_EMSLEY_Publishedonline7September2017_GOLD_VoR_CC_BY_.pdf" "https://europepmc.org/articles/PMC5614772?pdf=render"
get "Wang_2014_StudentLife.pdf" "https://studentlife.cs.dartmouth.edu/studentlife.pdf"
get "Rohani_2018_SensingDepressionReview.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6111148&blobtype=pdf" "https://europepmc.org/articles/PMC6111148?pdf=render"
get "Muller_2021_GPSDepressionGeneralize.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC8263566&blobtype=pdf" "https://www.nature.com/articles/s41598-021-93087-x.pdf" "https://europepmc.org/articles/PMC8263566?pdf=render"
get "Adler_2022_PassiveSensingGeneralization.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC9045602&blobtype=pdf" "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0266516&type=printable" "https://europepmc.org/articles/PMC9045602?pdf=render"
get "Wrzus_2023_EMACompliance.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC9999286&blobtype=pdf" "https://journals.sagepub.com/doi/pdf/10.1177/10731911211067538" "https://europepmc.org/articles/PMC9999286?pdf=render"
get "Harrer_2019_InternetInterventionsStudents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6877279&blobtype=pdf" "https://europepmc.org/articles/PMC6877279?pdf=render"
get "Linardon_2024_AppsMeta176RCTs.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC10785982&blobtype=pdf" "https://europepmc.org/articles/PMC10785982?pdf=render"
get "Lattie_2019_DigitalInterventionsCollege.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6681642&blobtype=pdf" "https://www.jmir.org/2019/7/e12869/PDF" "https://europepmc.org/articles/PMC6681642?pdf=render"
get "Weisel_2019_StandaloneApps.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6889400&blobtype=pdf" "https://www.nature.com/articles/s41746-019-0188-8.pdf" "https://europepmc.org/articles/PMC6889400?pdf=render"
get "Fincham_2023_BreathworkMeta.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC9828383&blobtype=pdf" "https://www.nature.com/articles/s41598-022-27247-y.pdf" "https://europepmc.org/articles/PMC9828383?pdf=render"
get "Jabs_2026_AppsUniversityStudents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC13406923&blobtype=pdf" "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1111/eip.70207?download=true" "https://europepmc.org/articles/PMC13406923?pdf=render"
get "Huckvale_2019_AppDataSharing.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6481440&blobtype=pdf" "https://jamanetwork.com/journals/jamanetworkopen/articlepdf/2730782/huckvale_2019_oi_190111.pdf" "https://europepmc.org/articles/PMC6481440?pdf=render"
get "Iwaya_2023_MentalHealthAppPrivacy.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC9643945&blobtype=pdf" "https://link.springer.com/content/pdf/10.1007/s10664-022-10236-0.pdf" "https://europepmc.org/articles/PMC9643945?pdf=render"
get "Roque_2025_PassiveDataAcceptability.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC12431785&blobtype=pdf" "https://europepmc.org/articles/PMC12431785?pdf=render"
get "Baumel_2019_AppEngagement.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC6785720&blobtype=pdf" "https://www.jmir.org/2019/9/e14567/PDF"
get "Borghouts_2021_EngagementBarriers.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC8074985&blobtype=pdf" "https://www.jmir.org/2021/3/e24387/PDF" "https://europepmc.org/articles/PMC8074985?pdf=render"
get "AstillWright_2025_MoodMonitoringAdverseEvents.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC12548826&blobtype=pdf" "https://europepmc.org/articles/PMC12548826?pdf=render"
get "Munir_2026_HarmsReportingYouthDMHI.pdf" "https://europepmc.org/backend/ptpmcrender.fcgi?accid=PMC13631862&blobtype=pdf" "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1679968/pdf" "https://europepmc.org/articles/PMC13631862?pdf=render"
echo; echo "New: $ok   Already had: $skip   Failed: $fail"
[ "$fail" -gt 0 ] && echo "For failures: open the DOI link from index.csv in your browser and save the PDF into papers/ under the local_file name."
