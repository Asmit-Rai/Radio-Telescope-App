export type ModuleStatus = 'available' | 'locked' | 'in-progress' | 'completed';

export interface Module {
  id: string;
  title: string;
  status: ModuleStatus;
  content: string;
  estimatedTime: number; // in minutes
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: 'Fundamentals' | 'Observation' | 'Analysis' | 'Advanced Concepts';
}

export interface Mission {
  id: string;
  title: string;
  status: ModuleStatus;
  description: string;
  requiredModules: string[]; // Module IDs that must be completed
  points: number;
  category: 'Observation' | 'Analysis' | 'Discovery' | 'Research';
}

export interface LearningStats {
  totalTimeSpent: number; // in minutes
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
  achievements: string[];
  totalModulesCompleted: number;
  totalMissionsCompleted: number;
  totalPoints: number;
}

export const initialModules: Module[] = [
  {
    id: '1',
    title: 'Radio Telescope Basics',
    status: 'available', // First module should be available by default
    content: `Radio telescopes are specialized instruments that detect radio waves from space rather than visible light. Unlike optical telescopes that use mirrors or lenses, radio telescopes use large dish antennas to collect and focus radio signals from celestial objects.

Key Components:
• Dish/Antenna: Collects radio waves and focuses them to a receiver
• Receiver: Converts radio waves into electrical signals
• Amplifier: Strengthens the weak signals from space
• Computer System: Processes and analyzes the data

Radio telescopes can observe the universe 24/7, unlike optical telescopes that are limited by daylight and weather. They can detect objects invisible to optical telescopes, such as gas clouds, pulsars, and the cosmic microwave background radiation.

The signals we receive are incredibly weak - often billions of times weaker than a cell phone signal. This is why radio telescopes need to be very large and sensitive, and why they're often located in remote areas away from radio interference.`,
    estimatedTime: 8,
    difficulty: 'Beginner',
    category: 'Fundamentals'
  },
  {
    id: '2',
    title: 'Understanding Radio Frequencies',
    status: 'locked',
    content: `Radio waves are a type of electromagnetic radiation with wavelengths longer than infrared light. In radio astronomy, we typically work with frequencies ranging from 10 MHz to 300 GHz.

Different frequencies tell us different things:
• Low frequencies (10-100 MHz): Galactic background radiation, Jupiter's radio emissions
• Medium frequencies (100 MHz - 10 GHz): Pulsars, hydrogen line at 1420 MHz, supernova remnants
• High frequencies (10-300 GHz): Molecular clouds, star formation regions, cosmic microwave background

The atmosphere affects radio waves differently based on frequency. Some frequencies are absorbed by water vapor, while others pass through clearly. This creates "radio windows" - frequency ranges where we can observe from Earth's surface.

Radio telescopes often use multiple frequencies simultaneously to get a complete picture of astronomical objects. This technique, called multi-frequency observation, helps us understand the physical processes occurring in space.`,
    estimatedTime: 10,
    difficulty: 'Beginner',
    category: 'Fundamentals'
  },
  {
    id: '3',
    title: 'Signal Processing Fundamentals',
    status: 'locked',
    content: `Raw radio signals from space are extremely weak and often buried in noise. Signal processing techniques help us extract meaningful astronomical data from these faint signals.

Key Concepts:
• Signal-to-Noise Ratio (SNR): Measures how strong a signal is compared to background noise
• Filtering: Removes unwanted frequencies and interference
• Integration: Combines multiple observations to improve signal strength
• Fourier Analysis: Breaks down complex signals into their frequency components

Common Processing Steps:
1. Amplification: Strengthen the weak incoming signal
2. Digitization: Convert analog signals to digital data
3. Filtering: Remove interference and noise
4. Calibration: Account for instrumental effects
5. Analysis: Extract scientific information

Modern radio telescopes generate enormous amounts of data - often terabytes per day. Specialized software and algorithms help astronomers process this data efficiently and identify interesting signals or patterns.`,
    estimatedTime: 12,
    difficulty: 'Intermediate',
    category: 'Analysis'
  },
  {
    id: '4',
    title: 'Types of Celestial Radio Sources',
    status: 'locked',
    content: `The universe is full of objects that emit radio waves. Understanding these sources helps us interpret the signals we detect.

Galactic Sources:
• Pulsars: Rapidly rotating neutron stars that emit regular radio pulses
• Supernova Remnants: Expanding shells of gas from stellar explosions
• HII Regions: Ionized hydrogen gas around hot, young stars
• Planetary Nebulae: Gas shells ejected by dying stars
• Jupiter: Emits strong radio signals due to its magnetic field

Extragalactic Sources:
• Quasars: Supermassive black holes consuming matter
• Radio Galaxies: Galaxies with active galactic nuclei
• Galaxy Clusters: Groups of galaxies emitting synchrotron radiation
• Cosmic Microwave Background: Radiation from the early universe

Each type of source has characteristic properties:
- Frequency spectrum
- Variability (constant vs. changing)
- Polarization
- Spatial structure

By studying these properties, astronomers can identify the type of object and understand the physical processes occurring within it.`,
    estimatedTime: 15,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '5',
    title: 'Data Analysis Techniques',
    status: 'locked',
    content: `Radio astronomy data analysis involves sophisticated techniques to extract scientific information from observations.

Statistical Analysis:
• Noise analysis: Understanding random fluctuations in data
• Correlation functions: Finding patterns and relationships
• Power spectra: Analyzing signal strength vs. frequency
• Time series analysis: Studying how signals change over time

Visualization Techniques:
• Waterfall plots: Show frequency vs. time
• Sky maps: Display signal strength across the sky
• Spectrograms: Reveal spectral features
• Light curves: Plot signal strength vs. time

Advanced Methods:
• Machine learning: Automated pattern recognition
• Interferometry: Combining signals from multiple telescopes
• Pulsar timing: Precise measurement of pulse arrival times
• Spectral line analysis: Studying specific frequencies

Quality Control:
- Flagging bad data due to interference
- Calibrating instrumental effects
- Correcting for atmospheric conditions
- Validating results through independent analysis

Modern radio astronomy relies heavily on computational tools and algorithms to process the vast amounts of data collected by telescopes worldwide.`,
    estimatedTime: 18,
    difficulty: 'Advanced',
    category: 'Analysis'
  },
  {
    id: '6',
    title: 'Pulsar Astronomy',
    status: 'locked',
    content: `Pulsars are among the most precise clocks in the universe. These rapidly rotating neutron stars emit beams of radio waves that sweep across space like lighthouse beams.

What Makes Pulsars Special:
• Incredibly dense: A teaspoon of neutron star material weighs about 6 billion tons
• Rapid rotation: Some spin hundreds of times per second
• Strong magnetic fields: Trillions of times stronger than Earth's
• Precise timing: More accurate than atomic clocks

Observational Characteristics:
• Regular pulses: From milliseconds to several seconds
• Dispersion: Different frequencies arrive at slightly different times
• Scintillation: Signals twinkle due to interstellar medium
• Period evolution: Pulsars gradually slow down over time

Scientific Applications:
- Testing general relativity
- Studying neutron star physics
- Mapping the galactic magnetic field
- Detecting gravitational waves
- Navigation for deep space missions

Pulsar discovery requires careful analysis of timing data and sophisticated algorithms to detect periodic signals buried in noise. The study of pulsars has led to Nobel Prizes and continues to provide insights into fundamental physics.`,
    estimatedTime: 20,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '7',
    title: 'Radio Interferometry',
    status: 'locked',
    content: `Radio interferometry combines signals from multiple telescopes to achieve much higher resolution than any single telescope could provide alone.

Basic Principles:
• Baseline: Distance between telescope pairs
• Correlation: Mathematical combination of signals
• Visibility: Measured quantity in interferometry
• Fourier Transform: Converts visibility data to images

Types of Arrays:
• Connected arrays: Telescopes linked by cables (VLA, ALMA)
• VLBI: Very Long Baseline Interferometry, telescopes worldwide
• Space VLBI: Including telescopes in orbit

Advantages:
- High angular resolution
- Ability to measure precise positions
- Enhanced sensitivity through combining signals
- Capability to study fine structure

Challenges:
• Clock synchronization across telescopes
• Atmospheric effects and delays
• Complex data processing requirements
• Calibration of instrumental differences

Applications:
- Mapping jets from black holes
- Studying star formation regions
- Measuring stellar distances
- Investigating active galactic nuclei

Modern interferometry produces the highest resolution images possible in astronomy, revealing details impossible to see with single telescopes.`,
    estimatedTime: 25,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '8',
    title: 'Searching for Extraterrestrial Intelligence',
    status: 'locked',
    content: `SETI (Search for Extraterrestrial Intelligence) uses radio telescopes to search for artificial signals from other civilizations.

Search Strategies:
• Targeted searches: Observing nearby star systems
• All-sky surveys: Scanning the entire visible sky
• Frequency ranges: Focusing on "quiet" parts of radio spectrum
• Pattern recognition: Looking for non-natural signal characteristics

Signal Characteristics to Look For:
- Narrow bandwidth (natural sources are usually broadband)
- Doppler drift due to planetary motion
- Regular patterns or modulation
- High intensity compared to background

Famous Projects:
• Project Ozma (1960): First systematic SETI search
• Wow! Signal (1977): Strongest candidate signal ever detected
• SETI@home: Distributed computing project
• Breakthrough Listen: Modern comprehensive search

Technical Challenges:
- Distinguishing artificial from natural signals
- Dealing with human-made interference
- Processing enormous amounts of data
- Avoiding false positives

While no confirmed extraterrestrial signals have been found, SETI research has advanced our understanding of radio astronomy and signal processing, while continuing the search for one of the most profound questions in science.`,
    estimatedTime: 16,
    difficulty: 'Intermediate',
    category: 'Advanced Concepts'
  },
  {
    id: '9',
    title: 'Cosmic Microwave Background',
    status: 'locked',
    content: `The Cosmic Microwave Background (CMB) is the afterglow of the Big Bang, providing a snapshot of the universe when it was only 380,000 years old.

Key Properties:
• Temperature: 2.725 Kelvin (very cold)
• Frequency: Peak at about 160 GHz
• Uniformity: Same temperature in all directions to 0.001%
• Tiny fluctuations: Seeds of galaxy formation

Discovery and Importance:
The CMB was accidentally discovered in 1965 by Penzias and Wilson, earning them the Nobel Prize. It provides crucial evidence for the Big Bang theory and helps us understand:
- The age of the universe (13.8 billion years)
- The composition of the universe
- How galaxies and stars formed

Observational Challenges:
• Extremely faint signal
• Contamination from galactic foreground
• Atmospheric absorption
• Instrumental noise and systematics

Space-based Missions:
- COBE (1989-1993): First detailed CMB maps
- WMAP (2001-2010): Precision cosmology
- Planck (2009-2013): Ultimate precision measurements

The CMB has revolutionized cosmology, allowing precise measurements of fundamental parameters and providing a detailed picture of the early universe.`,
    estimatedTime: 22,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '10',
    title: 'Advanced Data Processing',
    status: 'locked',
    content: `Modern radio astronomy generates petabytes of data requiring sophisticated processing techniques and computational resources.

Big Data Challenges:
• Volume: Terabytes to petabytes per day
• Velocity: Real-time processing requirements
• Variety: Different data formats and types
• Veracity: Ensuring data quality and reliability

Processing Pipeline:
1. Raw data acquisition
2. Radio frequency interference (RFI) mitigation
3. Calibration and flagging
4. Correlation and averaging
5. Imaging and deconvolution
6. Source extraction and cataloging

Advanced Techniques:
• Machine learning for pattern recognition
• GPU acceleration for parallel processing
• Cloud computing for scalable analysis
• Automated quality assessment
• Real-time transient detection

Software Tools:
- CASA: Common Astronomy Software Applications
- AIPS: Astronomical Image Processing System
- WSClean: Widefield imaging software
- Custom analysis scripts and pipelines

Future Developments:
The next generation of radio telescopes (Square Kilometre Array) will generate even more data, requiring revolutionary approaches to data processing, storage, and analysis. Artificial intelligence and machine learning will play increasingly important roles in extracting scientific insights from these massive datasets.`,
    estimatedTime: 28,
    difficulty: 'Advanced',
    category: 'Analysis'
  },
  {
    id: '11',
    title: 'Radio Telescope Arrays',
    status: 'locked',
    content: `Radio telescope arrays combine multiple antennas to achieve better sensitivity and resolution than single dishes can provide.

Famous Arrays:
• Very Large Array (VLA): 27 dishes in New Mexico
• Atacama Large Millimeter Array (ALMA): 66 antennas in Chile
• MeerKAT: 64 dishes in South Africa
• Australian Square Kilometre Array Pathfinder (ASKAP)

Array Configurations:
- Compact: Better for extended sources
- Extended: Higher resolution for point sources
- Hybrid: Compromise between sensitivity and resolution

Technical Considerations:
• Baseline coverage: Determines image quality
• Correlator: Combines signals from all antennas
• Clock synchronization: Critical for coherent combination
• Calibration: Accounting for atmospheric and instrumental effects

Advantages of Arrays:
- Improved sensitivity through signal combination
- Higher angular resolution
- Better image quality
- Ability to study both compact and extended sources

The future Square Kilometre Array will be the largest radio telescope ever built, with thousands of antennas across multiple continents.`,
    estimatedTime: 14,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '12',
    title: 'Transient Radio Sources',
    status: 'locked',
    content: `Transient radio sources are objects that appear, disappear, or change brightness over time scales from seconds to years.

Types of Transients:
• Fast Radio Bursts (FRBs): Millisecond-duration pulses
• Radio Supernovae: Weeks to years of radio emission
• Flare Stars: Minutes to hours of enhanced emission
• Active Galactic Nuclei: Variable over months to years
• Solar Radio Bursts: Seconds to minutes

Detection Challenges:
- Rare and unpredictable occurrence
- Need for continuous monitoring
- Real-time processing requirements
- Distinguishing from interference

Survey Projects:
• VAST: Variables and Slow Transients survey
• LOFAR Surveys: Low-frequency transient searches
• Real-time FRB detection systems
• All-sky monitoring programs

Scientific Importance:
Transients provide insights into:
- Stellar explosions and evolution
- Black hole physics
- Neutron star magnetospheres
- Interstellar medium properties

The study of radio transients is a rapidly growing field, with new discoveries changing our understanding of the dynamic radio universe.`,
    estimatedTime: 17,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '13',
    title: 'Galactic Structure Studies',
    status: 'locked',
    content: `Radio astronomy provides unique insights into the structure and dynamics of our Milky Way galaxy and other galaxies.

Key Observations:
• 21-cm Hydrogen Line: Traces neutral hydrogen gas
• Molecular Lines: CO, water, ammonia in star-forming regions
• Continuum Emission: Synchrotron radiation from cosmic rays
• Pulsar Distances: Mapping galactic structure

Galactic Components:
- Spiral arms: Traced by young stars and gas
- Central bar: Dense stellar structure
- Halo: Extended dark matter component
- Supermassive black hole: Sagittarius A*

Radio Mapping Techniques:
• Velocity mapping: Using Doppler shifts to measure rotation
• Absorption studies: Foreground gas absorbing background sources
• Polarization: Magnetic field structure
• Multi-frequency analysis: Different physical processes

Other Galaxies:
Radio observations reveal:
- Galaxy rotation curves (dark matter evidence)
- Star formation rates
- Active galactic nuclei
- Galaxy interactions and mergers

Understanding galactic structure helps us comprehend galaxy formation and evolution, dark matter distribution, and the cosmic web's large-scale structure.`,
    estimatedTime: 21,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '14',
    title: 'Radio Frequency Interference',
    status: 'locked',
    content: `Radio Frequency Interference (RFI) is unwanted radio emission from human-made sources that contaminates astronomical observations.

Common RFI Sources:
• Satellites: GPS, communication, military
• Aircraft: Navigation and communication systems
• Cell phones and WiFi: Ubiquitous signals
• Microwave ovens: Strong but localized
• Digital devices: Computers, TVs, LED lights

RFI Characteristics:
- Often much stronger than astronomical signals
- May be constant or intermittent
- Can mimic astronomical phenomena
- Frequency-dependent effects

Mitigation Strategies:
• Site selection: Remote locations away from cities
• Shielding: Physical barriers to block interference
• Filtering: Electronic removal of specific frequencies
• Time-domain flagging: Identifying and removing bad data
• Spatial filtering: Using multiple antennas to cancel RFI

Advanced Techniques:
- Machine learning for RFI recognition
- Real-time adaptive filtering
- Correlation-based cancellation
- Statistical analysis for detection

Radio Quiet Zones:
Special protected areas where radio transmissions are restricted to preserve astronomical observations, such as around the Green Bank Observatory in West Virginia.

Managing RFI is crucial for the success of radio astronomy and becomes increasingly challenging as technology proliferates.`,
    estimatedTime: 13,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '15',
    title: 'Spectral Line Astronomy',
    status: 'locked',
    content: `Spectral lines in radio astronomy provide detailed information about the physical and chemical conditions in space.

Important Radio Lines:
• 21-cm Hydrogen (1420 MHz): Most important line in radio astronomy
• OH lines (1665, 1667 MHz): Hydroxyl masers
• Water line (22 GHz): Star formation tracer
• CO lines: Molecular cloud mapping
• Recombination lines: Ionized gas studies

Line Formation:
Lines form when:
- Electrons change energy levels in atoms
- Molecules rotate or vibrate
- Magnetic field interactions occur (Zeeman effect)
- Hyperfine structure transitions

Observable Properties:
• Frequency: Identifies the species and transition
• Intensity: Indicates abundance and excitation
• Width: Temperature and turbulence information
• Profile shape: Velocity distribution and optical depth

Doppler Effects:
- Redshift/blueshift: Radial velocity measurement
- Line broadening: Thermal and turbulent motion
- Multiple components: Complex velocity structure

Applications:
- Mapping galactic rotation
- Studying star formation
- Measuring temperatures and densities
- Tracing chemical evolution
- Detecting molecules in space

Spectral line observations have revealed the chemical complexity of the universe and continue to discover new molecules in space.`,
    estimatedTime: 19,
    difficulty: 'Advanced',
    category: 'Analysis'
  },
  {
    id: '16',
    title: 'Solar Radio Astronomy',
    status: 'locked',
    content: `The Sun is the strongest radio source in our sky, providing insights into solar physics and space weather.

Solar Radio Emission Types:
• Quiet Sun: Thermal emission from the corona
• Solar Bursts: Sudden increases during flares
• Solar Storms: Extended periods of enhanced emission
• Coronal Mass Ejections: Plasma eruptions

Radio Burst Classifications:
- Type I: Noise storms
- Type II: Shock waves
- Type III: Fast-drift bursts
- Type IV: Broadband continuum
- Type V: Reverse-drift bursts

Observational Techniques:
• Dynamic spectra: Frequency vs. time plots
• Radio imaging: Spatial structure of sources
• Polarization studies: Magnetic field information
• Multi-frequency monitoring: Different solar layers

Solar Cycle Effects:
The 11-year solar cycle dramatically affects:
- Sunspot numbers
- Flare frequency
- Radio emission intensity
- Space weather impacts

Space Weather Applications:
Solar radio observations help predict:
- Satellite disruptions
- GPS navigation errors
- Power grid failures
- Communication blackouts

Dedicated Solar Radio Facilities:
- Solar radio spectrographs worldwide
- Radio heliographs for imaging
- Space-based solar radio missions

Understanding solar radio emission is crucial for space exploration and protecting technological infrastructure on Earth.`,
    estimatedTime: 16,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '17',
    title: 'Planetary Radio Astronomy',
    status: 'locked',
    content: `Planets in our solar system emit radio waves, providing unique insights into their atmospheres, magnetospheres, and internal structure.

Planetary Radio Sources:
• Jupiter: Strongest planetary radio source
• Saturn: Kilometric radiation and ring interactions
• Earth: Auroral kilometric radiation
• Uranus and Neptune: Weaker but detectable
• Venus and Mars: Thermal emission

Jupiter's Radio Emission:
- Decametric: Related to Io's orbital position
- Decimetric: Synchrotron radiation from radiation belts
- Thermal: Atmospheric temperature measurements
- Lightning: Storm activity detection

Observation Techniques:
• Ground-based radio telescopes
• Spacecraft radio receivers
• Very Long Baseline Interferometry
• Occultation experiments

Physical Processes:
- Cyclotron maser instability
- Synchrotron radiation
- Thermal emission
- Plasma wave interactions
- Lightning generation

Scientific Applications:
- Magnetic field mapping
- Atmospheric composition studies
- Ionospheric structure analysis
- Weather and climate research
- Interior structure investigations

Exoplanet Radio Emission:
Searches for radio emission from exoplanets could reveal:
- Magnetic field strength
- Atmospheric composition
- Auroral activity
- Potentially habitable conditions

Planetary radio astronomy bridges solar system science and radio astronomy techniques.`,
    estimatedTime: 18,
    difficulty: 'Intermediate',
    category: 'Observation'
  },
  {
    id: '18',
    title: 'Cosmological Radio Surveys',
    status: 'locked',
    content: `Large-scale radio surveys map the radio universe and study cosmological questions about structure formation and evolution.

Major Radio Surveys:
• NVSS: NRAO VLA Sky Survey
• FIRST: Faint Images of the Radio Sky at Twenty Centimeters
• LOFAR Surveys: Low-frequency radio sky
• EMU: Evolutionary Map of the Universe
• VLASS: VLA Sky Survey

Survey Objectives:
- Catalog millions of radio sources
- Study galaxy evolution over cosmic time
- Map large-scale structure
- Search for rare and exotic objects
- Provide reference for multi-wavelength studies

Observational Strategies:
• All-sky coverage: Complete sampling
• Multiple frequencies: Spectral information
• High sensitivity: Faint source detection
• Good resolution: Source morphology
- Systematic observing patterns

Data Products:
- Source catalogs with positions and fluxes
- Radio images covering large sky areas
- Spectral index maps
- Polarization information
- Time-domain databases

Cosmological Applications:
- Galaxy luminosity functions
- Radio source counts vs. redshift
- Large-scale structure studies
- Dark energy constraints
- Cosmic ray propagation

Survey Legacy:
Radio surveys create lasting databases used by astronomers worldwide for decades, enabling discoveries long after the original observations.`,
    estimatedTime: 20,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '19',
    title: 'Future Radio Astronomy',
    status: 'locked',
    content: `The future of radio astronomy promises revolutionary discoveries with next-generation instruments and techniques.

Square Kilometre Array (SKA):
• 50 times more sensitive than current telescopes
• Thousands of antennas across continents
• Unprecedented data rates and processing challenges
• Science goals: dark energy, galaxy evolution, astrobiology

Technological Advances:
- Phased array feeds: Multiple beams per antenna
- Software-defined radio: Flexible signal processing
- Machine learning: Automated discovery and classification
- Quantum computing: Future data processing capabilities
- Space-based arrays: Ultra-long baselines

Emerging Science Areas:
• Fast Radio Burst studies: Origins and applications
• Gravitational wave astronomy: Radio counterparts
• Dark matter detection: Axion searches
• Exoplanet characterization: Atmospheric studies
• Astrobiology: Technosignature searches

Data Challenges:
The next generation will produce:
- Exabytes of data annually
- Real-time processing requirements
- Global data sharing needs
- AI-driven analysis pipelines

International Collaboration:
- Global telescope networks
- Shared expertise and resources
- Standardized data formats
- Open science initiatives

Career Opportunities:
- Instrument development
- Software engineering
- Data science and analytics
- Theoretical astrophysics
- Science communication

The future of radio astronomy will transform our understanding of the universe and our place within it.`,
    estimatedTime: 24,
    difficulty: 'Advanced',
    category: 'Advanced Concepts'
  },
  {
    id: '20',
    title: 'Research Methods in Radio Astronomy',
    status: 'locked',
    content: `Scientific research in radio astronomy follows rigorous methods to ensure reliable discoveries and advance our understanding of the universe.

Research Process:
1. Literature review: Understanding current knowledge
2. Hypothesis formation: Testable scientific questions
3. Observation planning: Telescope time and strategies
4. Data collection: Systematic and unbiased sampling
5. Analysis and interpretation: Statistical methods
6. Peer review: Scientific validation
7. Publication: Sharing results with the community

Proposal Writing:
• Scientific justification: Why is this important?
• Technical feasibility: Can it be done?
• Time estimation: Realistic observing requirements
• Expected outcomes: Measurable goals
• Broader impacts: Benefits to science and society

Data Quality Assurance:
- Calibration procedures
- Error analysis and propagation
- Systematic uncertainty assessment
- Reproducibility checks
- Independent verification

Statistical Methods:
• Significance testing: Are results real?
• Error bars and confidence intervals
• Correlation analysis: Relationships between variables
• Model fitting: Theoretical predictions vs. observations
• Bayesian analysis: Probabilistic reasoning

Collaboration and Ethics:
- Team science and large collaborations
- Data sharing and open science
- Credit attribution and authorship
- Ethical use of telescope resources
- Responsible communication of results

Career Development:
- Graduate school preparation
- Postdoctoral research opportunities
- Faculty positions and research careers
- Industry applications of radio astronomy skills
- Science outreach and education

Research in radio astronomy combines technical expertise with scientific creativity to push the boundaries of human knowledge about the cosmos.`,
    estimatedTime: 26,
    difficulty: 'Advanced',
    category: 'Analysis'
  }
];

export const initialMissions: Mission[] = [
  {
    id: '1',
    title: 'Detection Fundamentals',
    status: 'available',
    description: 'Learn to identify and classify basic radio signals from celestial sources',
    requiredModules: ['1'],
    points: 100,
    category: 'Observation'
  },
  {
    id: '2',
    title: 'Frequency Analysis Challenge',
    status: 'locked',
    description: 'Analyze signals across different frequency bands to identify their sources',
    requiredModules: ['1', '2'],
    points: 150,
    category: 'Analysis'
  },
  {
    id: '3',
    title: 'Signal Processing Quest',
    status: 'locked',
    description: 'Apply filtering and processing techniques to extract weak signals from noise',
    requiredModules: ['1', '2', '3'],
    points: 200,
    category: 'Analysis'
  },
  {
    id: '4',
    title: 'Celestial Source Hunter',
    status: 'locked',
    description: 'Identify and catalog different types of astronomical radio sources',
    requiredModules: ['1', '2', '4'],
    points: 250,
    category: 'Discovery'
  },
  {
    id: '5',
    title: 'Advanced Data Analysis',
    status: 'locked',
    description: 'Master statistical analysis and visualization techniques for radio data',
    requiredModules: ['3', '5'],
    points: 300,
    category: 'Research'
  },
  {
    id: '6',
    title: 'Pulsar Timing Master',
    status: 'locked',
    description: 'Precisely measure pulsar pulse arrival times and analyze their properties',
    requiredModules: ['5', '6'],
    points: 400,
    category: 'Research'
  },
  {
    id: '7',
    title: 'Interferometry Expert',
    status: 'locked',
    description: 'Combine signals from multiple telescopes to create high-resolution images',
    requiredModules: ['6', '7'],
    points: 500,
    category: 'Research'
  },
  {
    id: '8',
    title: 'SETI Signal Analyst',
    status: 'locked',
    description: 'Search for and analyze potential artificial signals from extraterrestrial intelligence',
    requiredModules: ['7', '8'],
    points: 350,
    category: 'Discovery'
  },
  {
    id: '9',
    title: 'Cosmic Background Explorer',
    status: 'locked',
    description: 'Study the cosmic microwave background and its fluctuations',
    requiredModules: ['8', '9'],
    points: 450,
    category: 'Research'
  },
  {
    id: '10',
    title: 'Big Data Processing Champion',
    status: 'locked',
    description: 'Handle and process large-scale radio astronomy datasets efficiently',
    requiredModules: ['9', '10'],
    points: 600,
    category: 'Research'
  },
  {
    id: '11',
    title: 'Array Configuration Specialist',
    status: 'locked',
    description: 'Design and optimize radio telescope array configurations for specific observations',
    requiredModules: ['10', '11'],
    points: 300,
    category: 'Research'
  },
  {
    id: '12',
    title: 'Transient Event Detector',
    status: 'locked',
    description: 'Discover and characterize fast radio bursts and other transient phenomena',
    requiredModules: ['11', '12'],
    points: 400,
    category: 'Discovery'
  },
  {
    id: '13',
    title: 'Galactic Cartographer',
    status: 'locked',
    description: 'Map the structure and dynamics of our galaxy using radio observations',
    requiredModules: ['12', '13'],
    points: 350,
    category: 'Research'
  },
  {
    id: '14',
    title: 'RFI Mitigation Expert',
    status: 'locked',
    description: 'Master techniques for identifying and removing radio frequency interference',
    requiredModules: ['13', '14'],
    points: 300,
    category: 'Analysis'
  },
  {
    id: '15',
    title: 'Spectral Line Hunter',
    status: 'locked',
    description: 'Discover and analyze spectral lines to study cosmic chemistry',
    requiredModules: ['14', '15'],
    points: 450,
    category: 'Discovery'
  },
  {
    id: '16',
    title: 'Solar Weather Predictor',
    status: 'locked',
    description: 'Use solar radio observations to predict space weather events',
    requiredModules: ['15', '16'],
    points: 400,
    category: 'Analysis'
  },
  {
    id: '17',
    title: 'Planetary Explorer',
    status: 'locked',
    description: 'Study planetary radio emissions to understand atmospheric processes',
    requiredModules: ['16', '17'],
    points: 350,
    category: 'Observation'
  },
  {
    id: '18',
    title: 'Cosmic Surveyor',
    status: 'locked',
    description: 'Conduct large-scale radio surveys to map the universe',
    requiredModules: ['17', '18'],
    points: 500,
    category: 'Research'
  },
  {
    id: '19',
    title: 'Future Technology Pioneer',
    status: 'locked',
    description: 'Explore cutting-edge techniques in next-generation radio astronomy',
    requiredModules: ['18', '19'],
    points: 600,
    category: 'Research'
  },
  {
    id: '20',
    title: 'Research Master',
    status: 'locked',
    description: 'Design and execute original radio astronomy research projects',
    requiredModules: ['19', '20'],
    points: 750,
    category: 'Research'
  }
];