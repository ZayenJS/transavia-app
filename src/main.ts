require('dotenv').config();
import { Command } from 'commander';
import axios, { AxiosError } from 'axios';
import { Mailer } from './Mailer';

class AppDate extends Date {
  addDays = (days: number) => {
    const date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);

    return date;
  };
}

const requiredArgs = ['origin', 'destination', 'start'];
const program = new Command();

const formatDate = (time: string) =>
  Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));

program.version('0.0.1');
program
  .command('crawl')
  .option('-o, --origin <origin>', 'Origin airport code')
  .option('-d, --destination <destination>', 'Destination airport code')
  .option('-s, --start <start>', 'Start date')
  .option('-p, --price <price>', 'Maximum price')
  .option('-a, --adults [adults]', 'Number of adults')
  .option('-c, --children [children]', 'Number of children')
  .action(main);

program.parse(process.argv);

interface FlightArguments {
  origin: string;
  destination: string;
  start: string;
  price?: number;
  adults?: number;
  children?: number;
}

async function main(args: FlightArguments) {
  const { origin, destination, start, adults, children, price } = args;

  if (!origin || !destination || !start) {
    program.help();
    console.error(`Missing required arguments. Required arguments are: ${requiredArgs.join(', ')}`);
    process.exit(1);
  }

  const API_URL = 'https://api.transavia.com/v1/flightoffers/';

  const params = {
    origin,
    destination,
    originDepartureDate: start,
    directFlight: true,
    adults: adults ?? 2,
    children: children ?? 0,
  };

  const formattedStart = start.replace(/(\d{4})(\d{2})(\d{2})/, (_match, m1, m2, m3) => {
    return `${m1}-${m2}-${m3}`;
  });

  let mailText = '';
  let mailHTML = `
            <h1>Transavia résultat de la recherche</h1>
            <p>
              Voici les résultats de la recherche en fonction des paramètres que vous avez entrés:
            </p>
            <ul>
              <li>
                <strong>Départ:</strong> ${origin}
              </li>
              <li>
                <strong>Arrivée:</strong> ${destination}
              </li>
              <li>
                <strong>Date de départ:</strong> ${formatDate(formattedStart)}
              </li>
              <li>
                <strong>Nombre d'adultes:</strong> ${adults}
              </li>
              <li>
                <strong>Nombre d'enfants:</strong> ${children ?? 0}
              </li>
              <li>
                <strong>Prix maximum:</strong> ${price}
              </li>
            </ul>
            <table>
              <thead>
                <tr>
                  <th>Vol</th>
                  <th>Départ</th>
                  <th>Arrivée</th>
                  <th>Prix/passager</th>
                  <th>Passagers</th>
                  <th>Prix total</th>
                  <th>Lien</th>
                </tr>
              </thead>
              <tbody>
              `;

  let hasResults = false;

  for (let i = 0; i < 15; i++) {
    const date = new AppDate(formattedStart).addDays(i);

    params.originDepartureDate = date.toISOString().split('T')[0].replace(/-/g, '');

    const query = Object.entries(params)
      .map(([key, value]) => value && `${key}=${value}`)
      .filter(Boolean)
      .join('&');

    const URL = `${API_URL}?${query}`;

    try {
      const response = await axios.get(URL, {
        headers: {
          apikey: `${process.env.TRANSAVIA_API_KEY}`,
        },
      });

      const { flightOffer } = response.data;

      if (flightOffer.length) hasResults = true;

      for (const flight of flightOffer) {
        const { flightNumber } = flight.outboundFlight;
        const departureTime = flight.outboundFlight.departureDateTime;
        const arrivalTime = flight.outboundFlight.arrivalDateTime;
        const priceAllPassengers = flight.pricingInfoSum.totalPriceAllPassengers;
        const priceOnePassenger = flight.pricingInfoSum.totalPriceOnePassenger;
        const currency = flight.pricingInfoSum.currencyCode;
        const link = flight.deeplink.href.replace(/nl-NL/g, 'fr-FR');

        const maxPrice = price ?? 1_000;

        if (priceOnePassenger < maxPrice) {
          const hour = +Intl.DateTimeFormat('fr-FR', { hour: 'numeric' })
            .format(new Date(departureTime))
            .replace('h', '')
            .replace(/^0/, '')
            .trim();

          if (hour < 11 || hour > 14) {
            continue;
          }

          mailText += `Le vol n°${flightNumber} départ ${formatDate(
            departureTime,
          )} depuis ${origin}, arrivé ${arrivalTime} à ${destination} pour ${priceAllPassengers}${currency} (${priceOnePassenger}${currency}/passager). ${link}\n\n`;

          mailHTML += `
                <tr>
                  <td>${flightNumber}</td>
                  <td>${formatDate(departureTime)}</td>
                  <td>${formatDate(arrivalTime)}</td>
                  <td>${priceOnePassenger} ${currency}</td>
                  <td>${+params.adults + +params.children}</td>
                  <td>${priceAllPassengers} ${currency}</td>
                  <td><a href="${link}">${link}</a></td>
                </tr>`;
        }
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      console.log(axiosError.response?.data);
    }
  }

  mailHTML += `</tbody>
          </table>
          `;

  const mailer = new Mailer('David Nogueira <noreply@david-nogueira.dev>', [
    'dngjosejoao@gmail.com',
  ]);

  if (hasResults) {
    mailer.sendMail('Nouvelle offre de vol', mailText, mailHTML);
    console.log('Mail bien envoyé !');
  }
}
