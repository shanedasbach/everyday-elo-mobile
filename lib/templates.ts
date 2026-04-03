export interface Template {
  id: string;
  title: string;
  description?: string;
  share_code?: string;
  items: string[];
}

export const templates: Template[] = [
  {
    id: 'movies',
    title: 'Top 10 Movies of All Time',
    description: 'Rank the greatest films ever made',
    share_code: 'movies',
    items: ['The Godfather', 'The Shawshank Redemption', 'The Dark Knight', 'Pulp Fiction', "Schindler's List", 'The Lord of the Rings: Return of the King', 'Fight Club', 'Forrest Gump', 'Inception', 'The Matrix'],
  },
  {
    id: 'pizza',
    title: 'Best Pizza Toppings',
    description: 'What goes on the perfect pizza?',
    share_code: 'pizza',
    items: ['Pepperoni', 'Mushrooms', 'Sausage', 'Onions', 'Bacon', 'Extra cheese', 'Black olives', 'Green peppers', 'Pineapple', 'Jalapeños'],
  },
  {
    id: 'marvel',
    title: 'Best Marvel Movies',
    description: 'Rank the MCU',
    share_code: 'marvel',
    items: ['Avengers: Endgame', 'Avengers: Infinity War', 'Spider-Man: No Way Home', 'Black Panther', 'Guardians of the Galaxy', 'Iron Man', 'Thor: Ragnarok', 'Captain America: Civil War', 'The Avengers', 'Spider-Man: Homecoming'],
  },
  {
    id: 'albums',
    title: 'Greatest Albums',
    description: 'The best music albums of all time',
    share_code: 'albums',
    items: ['Abbey Road - The Beatles', 'Thriller - Michael Jackson', 'The Dark Side of the Moon - Pink Floyd', 'Rumours - Fleetwood Mac', 'Back in Black - AC/DC', 'Led Zeppelin IV', 'The Wall - Pink Floyd', 'Purple Rain - Prince', 'OK Computer - Radiohead', 'Nevermind - Nirvana'],
  },
  {
    id: 'tvshows',
    title: 'Best TV Shows',
    description: 'Peak television',
    share_code: 'tvshows',
    items: ['Breaking Bad', 'Game of Thrones', 'The Wire', 'The Sopranos', 'Friends', 'The Office', 'Stranger Things', 'The Crown', 'Chernobyl', 'Band of Brothers'],
  },
  {
    id: 'fastfood',
    title: 'Best Fast Food Chains',
    description: 'Where are you hitting the drive-thru?',
    share_code: 'fastfood',
    items: ["McDonald's", 'Chick-fil-A', "Wendy's", 'Taco Bell', 'In-N-Out', 'Five Guys', 'Chipotle', 'Shake Shack', 'Popeyes', 'Burger King'],
  },
  {
    id: 'videogames',
    title: 'Greatest Video Games',
    description: 'The games that defined generations',
    share_code: 'videogames',
    items: ['The Legend of Zelda: Breath of the Wild', 'Red Dead Redemption 2', 'The Witcher 3', 'Minecraft', 'Grand Theft Auto V', 'Elden Ring', 'Super Mario Odyssey', 'God of War (2018)', 'The Last of Us', 'Skyrim'],
  },
  {
    id: 'disney',
    title: 'Best Disney Movies',
    description: 'Animated classics and beyond',
    share_code: 'disney',
    items: ['The Lion King', 'Frozen', 'Toy Story', 'Finding Nemo', 'Moana', 'Aladdin', 'Beauty and the Beast', 'The Little Mermaid', 'Up', 'Coco'],
  },
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find(t => t.id === id);
}
